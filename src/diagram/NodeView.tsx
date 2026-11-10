/**
 * Shapes: boxes, cylinders, records and their cells, marks, notes, and their badges and pins.
 */
import * as stylex from "@stylexjs/stylex";
import { stroke, theme } from "../reader/theme.stylex.ts";
import { styled } from "../reader/ui.tsx";
import type { CompiledNode } from "./compiled.ts";
import { type Rect, union } from "./geometry.ts";
import { cylinderCap, defaultMetrics } from "./metrics.ts";
import {
  badge,
  categoryStyle,
  corner,
  Lines,
  outline,
  type PartState,
  partStyles,
  roleStyle,
  stateStyle,
  type Target,
  targetFor,
} from "./part.tsx";

const m = defaultMetrics;

export function NodeView({
  node,
  flagged,
  clip,
  target,
  state,
}: {
  node: CompiledNode;
  flagged: boolean;
  /** The prefix of this figure's clip paths, which keep cell fills inside their record. */
  clip: string;
  target?: Target;
  state?: PartState;
}) {
  // A record with cells is drawn in two layers: this body, then its outline over the cells.
  const layered = node.shape === "record" && node.rules !== undefined;
  const r = node.rect;
  if (node.shape === "space") return null;
  if (node.shape === "bar")
    return (
      <rect
        x={r.x}
        y={r.y}
        width={r.width}
        height={r.height}
        rx={2}
        {...stylex.props(styles.bar, partStyles.fade, stateStyle(state))}
      />
    );
  return (
    <g
      {...targetFor(target, state)}
      {...styled(
        "diagram-target",
        partStyles.target,
        roleStyle(node.role),
        categoryStyle(node.category),
        partStyles.fade,
        stateStyle(state),
      )}
    >
      <Shape node={node} clip={clip} />
      <Lines lines={node.lines} />
      {node.role === "warning" && !layered && <WarningBadge node={node} />}
      {flagged && !layered && (
        <rect
          {...outline(node.labelRect ? (union([r, node.labelRect]) as Rect) : r, 4)}
          rx={8}
          {...stylex.props(partStyles.flag)}
        />
      )}
    </g>
  );
}

/**
 * A warning part also says so without color: an exclamation mark on its top-right corner.
 * Amber and the accent can look alike, at a glance and with color blindness.
 */
function WarningBadge({ node }: { node: CompiledNode }) {
  const { x, y, width } = node.rect;
  const cx = x + width - 2;
  const cy = y + 2;
  return (
    <g>
      <circle cx={cx} cy={cy} r={badge.radius} {...stylex.props(styles.badge)} />
      <path
        d={`M${cx} ${cy - 3.5}V${cy + 0.5}M${cx} ${cy + 3.2}V${cy + 3.3}`}
        {...stylex.props(styles.badgeMark)}
      />
    </g>
  );
}

/**
 * A member's number on its top-left corner, for a remark elsewhere that refers to it. It is
 * drawn over the record's outline, and fades with the member.
 */
export function Pin({ node, state }: { node: CompiledNode; state: PartState }) {
  const { x, y } = node.rect;
  return (
    // biome-ignore lint/a11y/noAriaHiddenOnFocusable: The pin only paints; the member is the part.
    <g
      aria-hidden="true"
      {...stylex.props(
        roleStyle(node.role),
        categoryStyle(node.category),
        styles.passThrough,
        partStyles.fade,
        stateStyle(state),
      )}
    >
      <circle cx={x} cy={y} r={badge.radius + 1} {...stylex.props(styles.pin)} />
      <text
        x={x}
        y={y}
        fontSize={m.tabSize}
        fontWeight={m.labelWeight}
        {...stylex.props(partStyles.text, partStyles.sans, styles.pinText)}
      >
        {node.pin}
      </text>
    </g>
  );
}

/**
 * The outline of a record with cells, its title divider, and the hairlines between cells.
 * It is drawn after the cells, so their fills stay under it; it fades with the record.
 */
export function RecordOutline({
  node,
  flagged,
  state,
}: {
  node: CompiledNode;
  flagged: boolean;
  state: PartState;
}) {
  const { x, y, width: w, height: h } = node.rect;
  return (
    // biome-ignore lint/a11y/noAriaHiddenOnFocusable: The outline only paints; the record's body is the part.
    <g
      aria-hidden="true"
      {...stylex.props(
        roleStyle(node.role),
        categoryStyle(node.category),
        styles.passThrough,
        partStyles.fade,
        stateStyle(state),
      )}
    >
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={corner.shape}
        {...stylex.props(styles.outlineOnly, node.role === "external" && partStyles.dashed)}
      />
      {node.divider !== undefined && (
        <path d={`M${x} ${node.divider}H${x + w}`} {...stylex.props(styles.rule)} />
      )}
      <Rules node={node} />
      {node.role === "warning" && <WarningBadge node={node} />}
      {flagged && <rect {...outline(node.rect, 4)} rx={8} {...stylex.props(partStyles.flag)} />}
    </g>
  );
}

function Shape({ node, clip }: { node: CompiledNode; clip: string }) {
  const r = node.rect;
  const { x, y, width: w, height: h } = r;
  const shape = stylex.props(styles.shape, node.role === "external" && partStyles.dashed);
  switch (node.shape) {
    case "box":
      return <rect x={x} y={y} width={w} height={h} rx={corner.shape} {...shape} />;
    case "cylinder": {
      const ry = cylinderCap(w);
      const rx = w / 2;
      const top = y + ry;
      const bottom = y + h - ry;
      return (
        <>
          <path
            d={`M${x} ${top}A${rx} ${ry} 0 0 1 ${x + w} ${top}V${bottom}A${rx} ${ry} 0 0 1 ${x} ${bottom}Z`}
            {...shape}
          />
          <ellipse cx={x + rx} cy={top} rx={rx} ry={ry} {...shape} />
        </>
      );
    }
    case "actor": {
      const cx = x + w / 2;
      return (
        <g {...stylex.props(styles.figure)}>
          <circle cx={cx} cy={y + 6.5} r={5.5} />
          <path
            d={`M${cx} ${y + 12}V${y + 22}M${cx - 8} ${y + 15.5}H${cx + 8}M${cx} ${y + 22}L${cx - 6.5} ${y + 30}M${cx} ${y + 22}L${cx + 6.5} ${y + 30}`}
          />
        </g>
      );
    }
    case "note": {
      const f = 10;
      return (
        <>
          <path d={`M${x} ${y}H${x + w - f}L${x + w} ${y + f}V${y + h}H${x}Z`} {...shape} />
          <path d={`M${x + w - f} ${y}V${y + f}H${x + w}`} {...stylex.props(styles.fold)} />
        </>
      );
    }
    case "diamond":
      return (
        <polygon
          points={`${x + w / 2},${y} ${x + w},${y + h / 2} ${x + w / 2},${y + h} ${x},${y + h / 2}`}
          {...shape}
        />
      );
    case "dot":
      return <circle cx={x + w / 2} cy={y + h / 2} r={w / 2} {...stylex.props(styles.solid)} />;
    case "ring":
      return (
        <>
          <circle cx={x + w / 2} cy={y + h / 2} r={w / 2 - 0.75} {...stylex.props(styles.ring)} />
          <circle cx={x + w / 2} cy={y + h / 2} r={w / 2 - 5} {...stylex.props(styles.solid)} />
        </>
      );
    case "record":
      if (node.rules !== undefined)
        // The body of a record with cells: its fill, and the shape its cells are clipped to.
        return (
          <>
            <clipPath id={`${clip}-${node.id}`}>
              <rect x={x} y={y} width={w} height={h} rx={corner.shape} />
            </clipPath>
            <rect
              x={x}
              y={y}
              width={w}
              height={h}
              rx={corner.shape}
              {...stylex.props(styles.fillOnly)}
            />
          </>
        );
      return (
        <>
          <rect x={x} y={y} width={w} height={h} rx={corner.shape} {...shape} />
          {node.divider !== undefined && (
            <path d={`M${x} ${node.divider}H${x + w}`} {...stylex.props(styles.rule)} />
          )}
        </>
      );
    case "cell": {
      // A plain cell paints nothing; a cell with a role or category is filled. Its record
      // draws the dividers and the outline over it, and clips it to its rounded corners.
      // Inside, a ring shows while the cell is pointed at or a step focuses it.
      const filled = node.role !== "default" || node.category !== undefined;
      return (
        <g clipPath={node.parent ? `url(#${clip}-${node.parent})` : undefined}>
          <rect {...outline(r, 0)} {...stylex.props(filled ? styles.cellFill : styles.hitArea)} />
          <rect {...outline(r, -2)} {...stylex.props(styles.cellRing)} />
        </g>
      );
    }
    case "mark":
      return (
        <rect x={x} y={y} width={w} height={h} rx={corner.mark} {...stylex.props(styles.mark)} />
      );
    default:
      return <rect x={x} y={y} width={w} height={h} fill="transparent" />;
  }
}

/** Hairlines inside a record: under the ruler, beside the row offsets, between cells. */
function Rules({ node }: { node: CompiledNode }) {
  if (!node.rules) return null;
  const d = node.rules.map(([a, b]) => `M${a.x} ${a.y}L${b.x} ${b.y}`).join("");
  return <path d={d} {...stylex.props(styles.rule)} />;
}

const styles = stylex.create({
  shape: {
    fill: "var(--fill)",
    stroke: "var(--ink)",
    strokeWidth: `calc(var(--weight) + var(--boost, 0px))`,
    strokeLinejoin: "round",
  },
  fold: {
    fill: theme.diagramShade,
    stroke: "var(--ink)",
    strokeWidth: `calc(var(--weight) + var(--boost, 0px))`,
    strokeLinejoin: "round",
  },
  figure: {
    fill: "none",
    stroke: "var(--ink)",
    strokeWidth: `calc(var(--weight) + var(--boost, 0px))`,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  },
  solid: { fill: theme.text },
  ring: { fill: "none", stroke: theme.text, strokeWidth: stroke.line },
  rule: { stroke: "var(--ink)", strokeWidth: stroke.hairline },
  /** A record cell with a role or category: the cell's fill, inside its parent's outline. */
  cellFill: { fill: "var(--fill)", stroke: "none" },
  /** A record body under its cells, and its outline over them. */
  fillOnly: { fill: "var(--fill)", stroke: "none" },
  outlineOnly: {
    fill: "none",
    stroke: "var(--ink)",
    strokeWidth: `calc(var(--weight) + var(--boost, 0px))`,
    strokeLinejoin: "round",
  },
  /** A layer that only paints: the pointer reaches the part under it. */
  passThrough: { pointerEvents: "none" },
  /** A cell's ring: as wide as the boost, so it shows only on hover and focus. */
  cellRing: {
    fill: "none",
    stroke: "var(--ink)",
    strokeWidth: "calc(2 * var(--boost, 0px))",
  },
  /** A member's pin: its number in a dot of its ink. */
  pin: {
    fill: "var(--ink)",
    stroke: `var(--figure-bg, ${theme.surface})`,
    strokeWidth: 2,
  },
  pinText: { fill: theme.canvas },
  /** A plain cell paints nothing but must still take the pointer. */
  hitArea: { fill: "transparent", stroke: "none" },
  /** A text mark: a highlight behind the marked text, outlined so it reads without color. */
  mark: {
    fill: "var(--fill)",
    stroke: "var(--ink)",
    strokeWidth: `calc(${stroke.hairline} + var(--boost, 0px))`,
  },
  bar: {
    fill: theme.surfaceHover,
    stroke: theme.borderControl,
    strokeWidth: stroke.hairline,
  },
  badge: {
    fill: theme.warning,
    stroke: `var(--figure-bg, ${theme.surface})`,
    strokeWidth: 2,
  },
  badgeMark: {
    fill: "none",
    stroke: theme.canvas,
    strokeWidth: 1.8,
    strokeLinecap: "round",
  },
});
