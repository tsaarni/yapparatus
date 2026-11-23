/**
 * The SVG of a compiled diagram: the drawing that pictures also use, with each element's state,
 * colors, and address added, and the debug layer.
 */

import * as stylex from "@stylexjs/stylex";
import { createElement, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import type { CompiledDiagram, ElementState } from "../../diagram/drawing.ts";
import { minScale } from "../../diagram/metrics.ts";
import { outline } from "../../diagram/outlines.ts";
import { type ColorToken, colorTokens } from "../../diagram/paint.ts";
import {
  type DiagramPaint,
  drawDiagram,
  isText,
  type Layer,
  type SvgAttributes,
  type SvgNode,
  type SvgText,
} from "../../diagram/render.ts";
import { diagnosticCodes } from "../../document/diagnostic.ts";
import { styled } from "../style/styled.ts";
import { dash, fontSize, space, stroke, theme } from "../style/theme.stylex.ts";
import {
  categoryStyle,
  elementStyles,
  interactive,
  roleStyle,
  stateStyle,
  targetFor,
} from "./element.tsx";

const dev = import.meta.env.DEV;

/**
 * The web app's paint: theme variables, and each element's colors from the custom properties
 * its role and category set, so a theme switch or a pointed-at element needs no new drawing.
 */
const paint: DiagramPaint = {
  colors: Object.fromEntries(
    colorTokens.map((token) => [token, theme[token]]),
  ) as unknown as Record<ColorToken, string>,
  stroke,
  dash,
  background: `var(--figure-bg, ${theme.surface})`,
  ink: () => ({
    ink: "var(--ink)",
    fill: "var(--fill)",
    label: `var(--label, ${theme.text})`,
    weight: "var(--weight)",
  }),
  boost: (weight) => `calc(${weight} + var(--boost, 0px))`,
  pointer: { hitWidth: 14, ringWidth: "calc(2 * var(--boost, 0px))" },
};

/** SVG attribute names as React writes them: `stroke-width` as `strokeWidth`. */
function reactAttributes(attributes: SvgAttributes): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(attributes)) {
    if (value === undefined) continue;
    const key = /^(data|aria)-/.test(name)
      ? name
      : name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    out[key] = value;
  }
  return out;
}

/** A line of text, set in the web app's fonts at the position the compiler measured. */
function TextView({ text }: { text: SvgText }) {
  const { line } = text;
  return (
    <text
      x={line.x}
      y={line.y}
      fontSize={line.size}
      fontWeight={line.weight}
      fill={text.fill}
      {...stylex.props(
        elementStyles.text,
        line.mono ? elementStyles.mono : elementStyles.sans,
        line.align === "start" && elementStyles.start,
        text.halo && elementStyles.halo,
      )}
    >
      {line.text}
    </text>
  );
}

/** What the web app adds to an element's group in the drawing. */
interface Context {
  figure: string | undefined;
  stateOf: (element: string) => ElementState;
  button: (element: string) => boolean;
}

/** The look, the step state, and the address of a group, as attributes and classes. */
function layerProps(layer: Layer, context: Context) {
  const state = layer.state === undefined ? undefined : context.stateOf(layer.state);
  const look = layer.look && [
    layer.look.frame
      ? (elementStyles.frameLook as stylex.StyleXStyles)
      : roleStyle(layer.look.role ?? "default"),
    categoryStyle(layer.look.category),
  ];
  const faded = layer.state !== undefined && [elementStyles.fade, stateStyle(state)];
  if (layer.target && layer.id) {
    const target = interactive(
      layer.id,
      layer.target.label,
      context.figure,
      context.button(layer.id),
    );
    return {
      ...targetFor(target, state),
      ...styled("diagram-target", elementStyles.target, look, faded),
    };
  }
  const addressed = layer.shape === "enclosure" || layer.shape === "frame";
  return {
    ...(addressed && layer.id ? { "data-element-id": layer.id } : {}),
    ...(layer.state !== undefined ? targetFor(undefined, state) : {}),
    ...(layer.decor ? { "aria-hidden": true } : {}),
    ...stylex.props(look, layer.decor && styles.passThrough, faded),
  };
}

/** A node of the drawing as a React element. */
function view(node: SvgNode, key: number, context: Context): ReactNode {
  if (isText(node)) return <TextView key={key} text={node} />;
  const props = {
    key,
    ...reactAttributes(node.attributes),
    ...(node.layer ? layerProps(node.layer, context) : {}),
  };
  if (node.markup !== undefined)
    return createElement(node.tag, { ...props, dangerouslySetInnerHTML: { __html: node.markup } });
  return createElement(
    node.tag,
    props,
    node.children?.map((child, i) => view(child, i, context)),
  );
}

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
  const anyStepped = [...diagram.nodes, ...diagram.edges].some((p) => stepped(p.id));
  const idPrefix = `clip${marker.replace(/[^a-zA-Z0-9]/g, "")}`;
  const context: Context = { figure, stateOf, button: (id) => dev || stepped(id) };
  const drawn = drawDiagram(diagram, paint, { flagged, idPrefix });
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
      {drawn.map((node, i) => view(node, i, context))}
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
  /** A layer that only paints: the pointer reaches the element under it. */
  passThrough: { pointerEvents: "none" },
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
