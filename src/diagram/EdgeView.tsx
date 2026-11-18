/**
 * Edges, enclosures, and frames.
 */
import * as stylex from "@stylexjs/stylex";
import { dash, stroke, theme } from "../reader/theme.stylex.ts";
import { styled } from "../reader/ui.tsx";
import type { CompiledEdge, CompiledEnclosure, CompiledFrame, PartState } from "./compiled.ts";
import { corner } from "./metrics.ts";
import {
  categoryStyle,
  Line,
  partStyles,
  roleStyle,
  stateStyle,
  type Target,
  targetFor,
} from "./part.tsx";
import { fragmentTab, outline, pointList, roundedPath, rule } from "./shapes.ts";

export function EdgeView({
  edge,
  flagged,
  target,
  state,
}: {
  edge: CompiledEdge;
  flagged: boolean;
  target?: Target;
  state?: PartState;
}) {
  const d = roundedPath(edge.points, edge.radius);
  if (edge.passive) return <path d={d} {...stylex.props(roleStyle(edge.role), styles.lifeline)} />;
  return (
    <g
      {...targetFor(target, state)}
      {...styled(
        "diagram-target",
        partStyles.target,
        roleStyle(edge.role),
        categoryStyle(edge.category),
        styles.edge,
        partStyles.fade,
        stateStyle(state),
      )}
    >
      <path d={d} {...stylex.props(styles.line, edge.dashed && partStyles.dashed)} />
      <path d={d} {...stylex.props(styles.hit)} />
      {edge.heads.map((head, i) =>
        edge.head === "open" ? (
          <polyline
            // biome-ignore lint/suspicious/noArrayIndexKey: Heads are positional.
            key={i}
            points={pointList(head)}
            {...stylex.props(styles.openHead)}
          />
        ) : (
          <polygon
            // biome-ignore lint/suspicious/noArrayIndexKey: Heads are positional.
            key={i}
            points={pointList(head)}
            {...stylex.props(styles.head)}
          />
        ),
      )}
      {edge.labels.flatMap((label, i) =>
        label.lines.map((line, j) => (
          <text
            // biome-ignore lint/suspicious/noArrayIndexKey: Labels and their lines are positional.
            key={`${i}-${j}`}
            x={line.x}
            y={line.y}
            fontSize={line.size}
            fontWeight={line.weight}
            {...stylex.props(partStyles.text, partStyles.sans, styles.edgeLabel, partStyles.halo)}
          >
            {line.text}
          </text>
        )),
      )}
      {flagged &&
        edge.labels.map((label, i) => (
          <rect
            // biome-ignore lint/suspicious/noArrayIndexKey: Labels are positional.
            key={`f${i}`}
            {...outline(label.rect, 1)}
            rx={4}
            {...stylex.props(partStyles.flag)}
          />
        ))}
    </g>
  );
}

export function EnclosureView({
  enclosure: e,
  state,
}: {
  enclosure: CompiledEnclosure;
  state: PartState;
}) {
  const t = e.titleRect;
  return (
    <g
      data-element-id={e.id}
      {...stylex.props(
        roleStyle(e.role),
        categoryStyle(e.category),
        partStyles.fade,
        stateStyle(state),
      )}
    >
      <rect
        x={e.rect.x}
        y={e.rect.y}
        width={e.rect.width}
        height={e.rect.height}
        rx={corner.group}
        {...stylex.props(styles.enclosure)}
      />
      {e.title && t && (
        <>
          <rect
            x={t.x}
            y={t.y}
            width={t.width}
            height={t.height}
            rx={t.height / 2}
            {...stylex.props(styles.tab)}
          />
          <Line line={e.title} />
        </>
      )}
    </g>
  );
}

/** Frames paint in two layers: the outline under everything, the labels above it. */
export function FrameView({
  frame: f,
  layer,
  state,
}: {
  frame: CompiledFrame;
  layer: "outline" | "labels";
  state: PartState;
}) {
  const fade = stylex.props(partStyles.fade, stateStyle(state));
  const { x, y, width: w, height: h } = f.rect;
  if (layer === "outline")
    return (
      <g data-element-id={f.id} {...fade}>
        <rect x={x} y={y} width={w} height={h} rx={corner.frame} {...stylex.props(styles.frame)} />
        {f.dividers.map((divider, i) => (
          <path
            // biome-ignore lint/suspicious/noArrayIndexKey: Dividers are positional.
            key={i}
            d={rule(f.rect, divider.y)}
            {...stylex.props(styles.frame, partStyles.dashed)}
          />
        ))}
      </g>
    );
  const tab = f.tab?.rect;
  return (
    <g {...fade}>
      {f.tab && tab && (
        <>
          <path d={fragmentTab(tab)} {...stylex.props(styles.frameTab)} />
          <Line line={f.tab.line} />
        </>
      )}
      {f.title && <Line line={f.title} halo />}
      {f.dividers.map(
        (divider, i) =>
          // biome-ignore lint/suspicious/noArrayIndexKey: Dividers are positional.
          divider.label && <Line key={i} line={divider.label} halo />,
      )}
    </g>
  );
}

const styles = stylex.create({
  edgeLabel: { fill: theme.textBody },
  edge: { color: "var(--ink)" },
  line: {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: `calc(var(--weight) + var(--boost, 0px))`,
    strokeLinejoin: "round",
    strokeLinecap: "round",
  },
  lifeline: {
    fill: "none",
    stroke: "var(--ink)",
    strokeWidth: stroke.hairline,
    strokeDasharray: dash.dotted,
  },
  hit: {
    fill: "none",
    stroke: "transparent",
    strokeWidth: 14,
  },
  head: { fill: "currentColor" },
  openHead: {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: `calc(var(--weight) + var(--boost, 0px))`,
    strokeLinejoin: "round",
    strokeLinecap: "round",
  },
  enclosure: {
    fill: "transparent",
    stroke: "var(--ink)",
    strokeWidth: `calc(var(--weight) + var(--boost, 0px))`,
    strokeDasharray: dash.dashed,
  },
  tab: {
    fill: `var(--figure-bg, ${theme.surface})`,
    stroke: "var(--ink)",
    strokeWidth: `calc(var(--weight) + var(--boost, 0px))`,
  },
  frame: {
    fill: "none",
    stroke: theme.borderControl,
    strokeWidth: stroke.hairline,
  },
  frameTab: {
    fill: theme.surfaceRaised,
    stroke: theme.borderControl,
    strokeWidth: stroke.hairline,
  },
});
