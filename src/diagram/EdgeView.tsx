/**
 * Edges, enclosures, and frames.
 */
import * as stylex from "@stylexjs/stylex";
import { dash, stroke, theme } from "../reader/theme.stylex.ts";
import { styled } from "../reader/ui.tsx";
import type { CompiledEdge, CompiledEnclosure, CompiledFrame } from "./compiled.ts";
import type { Vec } from "./geometry.ts";
import {
  categoryStyle,
  corner,
  Line,
  outline,
  type PartState,
  partStyles,
  roleStyle,
  stateStyle,
  type Target,
  targetFor,
} from "./part.tsx";

/** A polyline whose bends are rounded by up to `radius`. */
function roundedPath(points: Vec[], radius: number): string {
  const first = points[0];
  if (!first) return "";
  let d = `M${first.x} ${first.y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1] as Vec;
    const at = points[i] as Vec;
    const next = points[i + 1] as Vec;
    const inLen = Math.hypot(at.x - prev.x, at.y - prev.y);
    const outLen = Math.hypot(next.x - at.x, next.y - at.y);
    const r = Math.min(radius, inLen / 2, outLen / 2);
    if (r < 0.5) {
      d += `L${at.x} ${at.y}`;
      continue;
    }
    const a = { x: at.x - ((at.x - prev.x) / inLen) * r, y: at.y - ((at.y - prev.y) / inLen) * r };
    const b = {
      x: at.x + ((next.x - at.x) / outLen) * r,
      y: at.y + ((next.y - at.y) / outLen) * r,
    };
    d += `L${a.x} ${a.y}Q${at.x} ${at.y} ${b.x} ${b.y}`;
  }
  const last = points[points.length - 1] as Vec;
  return `${d}L${last.x} ${last.y}`;
}

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
            points={head.map((p) => `${p.x},${p.y}`).join(" ")}
            {...stylex.props(styles.openHead)}
          />
        ) : (
          <polygon
            // biome-ignore lint/suspicious/noArrayIndexKey: Heads are positional.
            key={i}
            points={head.map((p) => `${p.x},${p.y}`).join(" ")}
            {...stylex.props(styles.head)}
          />
        ),
      )}
      {edge.labels.map((label, i) => (
        <text
          // biome-ignore lint/suspicious/noArrayIndexKey: Labels are positional.
          key={i}
          x={label.center.x}
          y={label.center.y}
          fontSize={label.size}
          fontWeight={label.weight}
          {...stylex.props(partStyles.text, partStyles.sans, styles.edgeLabel, partStyles.halo)}
        >
          {label.text}
        </text>
      ))}
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
            d={`M${x} ${divider.y}H${x + w}`}
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
          <path
            d={`M${tab.x} ${tab.y}H${tab.x + tab.width}V${tab.y + tab.height - 6}L${tab.x + tab.width - 6} ${tab.y + tab.height}H${tab.x}Z`}
            {...stylex.props(styles.frameTab)}
          />
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
