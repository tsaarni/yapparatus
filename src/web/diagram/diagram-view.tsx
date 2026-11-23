/**
 * The SVG of a compiled diagram: its elements in drawing order, and the debug layer.
 */

import * as stylex from "@stylexjs/stylex";
import type { KeyboardEvent, MouseEvent } from "react";
import type { CompiledDiagram, ElementState } from "../../diagram/drawing.ts";
import { minScale } from "../../diagram/metrics.ts";
import { outline } from "../../diagram/outlines.ts";
import { diagnosticCodes } from "../../document/diagnostic.ts";
import { fontSize, space, theme } from "../style/theme.stylex.ts";
import { EdgeView, EnclosureView, FrameView } from "./edge-view.tsx";
import { interactive } from "./element.tsx";
import { CellWarning, NodeView, Pin, RecordOutline } from "./node-view.tsx";

const dev = import.meta.env.DEV;

/** A compiled diagram as SVG, with each element's state and the handlers for stepping. */
export function DiagramView({
  diagram,
  title,
  debug,
  stale = false,
  marker,
  figure,
  stateOf,
  stepped,
  onClick,
  onKeyDown,
}: {
  diagram: CompiledDiagram;
  title: string;
  debug: boolean;
  stale?: boolean;
  marker: string;
  figure: string | undefined;
  stateOf: (element: string) => ElementState;
  stepped: (element: string) => boolean;
  onClick?: (event: MouseEvent) => void;
  onKeyDown?: (event: KeyboardEvent) => void;
}) {
  if (!diagram.ok)
    return (
      <div data-figure={marker} role="img" aria-label={title} {...stylex.props(styles.failed)}>
        This diagram could not be drawn. See the errors below.
      </div>
    );
  const vb = diagram.viewBox;
  const flagged = new Set(
    dev
      ? diagram.diagnostics.flatMap((d) =>
          diagnosticCodes[d.code].severity === "warning" ? d.ids : [],
        )
      : [],
  );
  const passive = diagram.edges.filter((e) => e.passive);
  const active = diagram.edges.filter((e) => !e.passive);
  const element = (id: string, label: string) => ({
    state: stateOf(id),
    target: interactive(id, label, figure, dev || stepped(id)),
  });
  const decoration = (state: ElementState) => (state && state !== "focus" ? { state } : {});
  const anyStepped = [...diagram.nodes, ...diagram.edges].some((p) => stepped(p.id));
  const clip = `clip${marker.replace(/[^a-zA-Z0-9]/g, "")}`;
  const iconOf = (name: string | undefined) =>
    name !== undefined && Object.hasOwn(diagram.icons, name) ? diagram.icons[name] : undefined;
  return (
    <svg
      data-figure={marker}
      viewBox={`${vb.x} ${vb.y} ${vb.width} ${vb.height}`}
      width={vb.width}
      height={vb.height}
      role={dev || anyStepped ? "group" : "img"}
      onClick={onClick}
      onKeyDown={onKeyDown}
      aria-label={title}
      {...stylex.props(
        styles.svg,
        styles.minWidth(Math.round(vb.width * minScale)),
        stale && styles.stale,
      )}
    >
      {diagram.frames.map((frame) => (
        <FrameView key={frame.id} frame={frame} layer="outline" state={stateOf(frame.id)} />
      ))}
      {diagram.enclosures.map((e) => (
        <EnclosureView key={e.id} enclosure={e} state={stateOf(e.id)} />
      ))}
      {passive.map((edge) => (
        <EdgeView key={edge.id} edge={edge} flagged={false} />
      ))}
      {active.map((edge) => (
        <EdgeView
          key={edge.id}
          edge={edge}
          flagged={flagged.has(edge.id)}
          {...element(edge.id, edge.ariaLabel)}
        />
      ))}
      {diagram.nodes.map((node) => (
        <NodeView
          key={node.id}
          node={node}
          icon={iconOf(node.icon?.name)}
          flagged={flagged.has(node.id)}
          clip={clip}
          {...(node.passive
            ? decoration(node.follows ? stateOf(node.follows) : undefined)
            : element(node.id, node.label))}
        />
      ))}
      {diagram.nodes
        .filter((node) => node.rules)
        .map((node) => (
          <RecordOutline
            key={`${node.id}-outline`}
            node={node}
            flagged={flagged.has(node.id)}
            state={stateOf(node.id)}
          />
        ))}
      {diagram.nodes.map(
        (node) =>
          node.shape === "cell" &&
          node.role === "warning" && (
            <CellWarning key={`${node.id}-warning`} node={node} state={stateOf(node.id)} />
          ),
      )}
      {diagram.nodes.map(
        (node) =>
          node.pin !== undefined && (
            <Pin key={`${node.id}-pin`} node={node} state={stateOf(node.id)} />
          ),
      )}
      {diagram.frames.map((frame) => (
        <FrameView
          key={`${frame.id}-labels`}
          frame={frame}
          layer="labels"
          state={stateOf(frame.id)}
        />
      ))}
      {debug && <DebugLayer diagram={diagram} />}
    </svg>
  );
}

/** Node bounds and ids, route vertices, and label boxes, drawn over the diagram for debugging. */
function DebugLayer({ diagram }: { diagram: CompiledDiagram }) {
  return (
    // biome-ignore lint/a11y/noAriaHiddenOnFocusable: The debug layer has no focusable content.
    <g aria-hidden="true" {...stylex.props(styles.debug)}>
      {diagram.nodes.map((n) => (
        <g key={n.id}>
          <rect {...outline(n.rect, 0)} fill="none" />
          <text x={n.rect.x + 2} y={n.rect.y - 4} {...stylex.props(styles.debugText)}>
            {n.id}
          </text>
        </g>
      ))}
      {diagram.edges.flatMap((e) =>
        e.points.map((p, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: Vertices are positional.
          <circle key={`${e.id}-${i}`} cx={p.x} cy={p.y} r={2.5} />
        )),
      )}
      {diagram.edges.flatMap((e) =>
        e.labels.map((l, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: Labels are positional.
          <rect key={`${e.id}-label-${i}`} {...outline(l.rect, 0)} fill="none" />
        )),
      )}
    </g>
  );
}

const styles = stylex.create({
  svg: {
    display: "block",
    maxWidth: "100%",
    height: "auto",
    marginInline: "auto",
    overflow: "visible",
  },
  minWidth: (width: number) => ({ minWidth: `${width}px` }),
  stale: { opacity: 0.35, filter: "grayscale(1)" },
  failed: {
    padding: space.xl,
    color: theme.error,
    fontSize: fontSize.sm,
    textAlign: "center",
  },
  debug: {
    color: theme.error,
    fill: "currentColor",
    stroke: "currentColor",
    strokeWidth: 0.75,
    pointerEvents: "none",
  },
  debugText: {
    fontFamily: theme.mono,
    fontSize: "9px",
    stroke: "none",
  },
});
