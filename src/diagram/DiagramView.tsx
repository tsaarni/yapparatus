/**
 * The SVG of a compiled diagram: its parts in drawing order, and the debug layer.
 */
import * as stylex from "@stylexjs/stylex";
import type { KeyboardEvent, MouseEvent } from "react";
import { diagnosticCodes } from "../protocol.ts";
import { fontSize, space, theme } from "../reader/theme.stylex.ts";
import type { CompiledDiagram } from "./compiled.ts";
import { EdgeView, EnclosureView, FrameView } from "./EdgeView.tsx";
import { CellWarning, NodeView, Pin, RecordOutline } from "./NodeView.tsx";
import { interactive, outline, type PartState } from "./part.tsx";

const dev = import.meta.env.DEV;

/** Drawings shrink to this fraction of their natural size before the figure scrolls. */
export const minScale = 0.75;

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
  stateOf: (part: string) => PartState;
  stepped: (part: string) => boolean;
  /** Delegated from the parts: open the step a part belongs to, and step with the keyboard. */
  onClick?: (event: MouseEvent) => void;
  onKeyDown?: (event: KeyboardEvent) => void;
}) {
  if (!diagram.ok)
    return (
      <div data-diagram={marker} role="img" aria-label={title} {...stylex.props(styles.failed)}>
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
  const part = (id: string, label: string) => ({
    state: stateOf(id),
    target: interactive(id, label, figure, dev || stepped(id)),
  });
  // Decorations fade and hide with their edge, but never take the accent themselves.
  const decoration = (state: PartState) => (state && state !== "focus" ? { state } : {});
  const anyStepped = [...diagram.nodes, ...diagram.edges].some((p) => stepped(p.id));
  // Clip paths are named per figure: several figures can have a record with the same id.
  const clip = `clip${marker.replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <svg
      data-diagram={marker}
      viewBox={`${vb.x} ${vb.y} ${vb.width} ${vb.height}`}
      width={vb.width}
      height={vb.height}
      // An image hides its parts from assistive technology; interactive parts need a group.
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
      {diagram.nodes.map((node) => (
        <NodeView
          key={node.id}
          node={node}
          flagged={flagged.has(node.id)}
          clip={clip}
          {...(node.passive
            ? decoration(node.follows ? stateOf(node.follows) : undefined)
            : part(node.id, node.label))}
        />
      ))}
      {/* Over every shape: records' outlines, which cover their cells' fills, then cells'
          warning badges and pins. */}
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
      {active.map((edge) => (
        <EdgeView
          key={edge.id}
          edge={edge}
          flagged={flagged.has(edge.id)}
          {...part(edge.id, edge.ariaLabel)}
        />
      ))}
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
        e.labels.map((l) => <rect key={`${e.id}-${l.text}`} {...outline(l.rect, 0)} fill="none" />),
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
