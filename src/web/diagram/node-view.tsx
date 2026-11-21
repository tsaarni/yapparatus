/**
 * Shapes: boxes, cylinders, flow shapes, records and their cells, marks, notes, badges, and pins.
 */

import * as stylex from "@stylexjs/stylex";
import type { CompiledNode, ElementState } from "../../diagram/drawing.ts";
import { type Rect, union } from "../../diagram/geometry.ts";
import { badge, corner, defaultMetrics } from "../../diagram/metrics.ts";
import * as shape from "../../diagram/outlines.ts";
import { styled } from "../style/styled.ts";
import { stroke, theme } from "../style/theme.stylex.ts";
import {
  categoryStyle,
  elementStyles,
  Lines,
  roleStyle,
  stateStyle,
  type Target,
  targetFor,
} from "./element.tsx";

const m = defaultMetrics;

/** A node: its shape, text lines, and warning badge, or a bar or nothing for those shapes. */
export function NodeView({
  node,
  flagged,
  clip,
  target,
  state,
}: {
  node: CompiledNode;
  flagged: boolean;
  clip: string;
  target?: Target;
  state?: ElementState;
}) {
  const layered = (node.shape === "record" && node.rules !== undefined) || node.shape === "cell";
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
        {...stylex.props(styles.bar, elementStyles.fade, stateStyle(state))}
      />
    );
  return (
    <g
      {...targetFor(target, state)}
      {...styled(
        "diagram-target",
        elementStyles.target,
        roleStyle(node.role),
        categoryStyle(node.category),
        elementStyles.fade,
        stateStyle(state),
      )}
    >
      <Shape node={node} clip={clip} />
      <Lines lines={node.lines} />
      {node.role === "warning" && !layered && <WarningBadge node={node} />}
      {flagged && !layered && (
        <rect
          {...shape.outline(node.labelRect ? (union([r, node.labelRect]) as Rect) : r, 4)}
          rx={8}
          {...stylex.props(elementStyles.flag)}
        />
      )}
    </g>
  );
}

/**
 * A warning element also says so without color: an exclamation mark on its top-right corner.
 * Amber and the accent can look alike, at a glance and with color blindness.
 */
function WarningBadge({ node }: { node: CompiledNode }) {
  const c = shape.badgeCenter(node.rect);
  return (
    <g>
      <circle cx={c.x} cy={c.y} r={badge.radius} {...stylex.props(styles.badge)} />
      <path d={shape.badgeMark(c)} {...stylex.props(styles.badgeMark)} />
    </g>
  );
}

/**
 * A warning cell's badge, drawn over its record's outline and dividers, which would cross it.
 * It fades with the cell.
 */
export function CellWarning({ node, state }: { node: CompiledNode; state: ElementState }) {
  return (
    // biome-ignore lint/a11y/noAriaHiddenOnFocusable: The badge only paints; the cell is the element.
    <g
      aria-hidden="true"
      {...stylex.props(
        roleStyle(node.role),
        styles.passThrough,
        elementStyles.fade,
        stateStyle(state),
      )}
    >
      <WarningBadge node={node} />
    </g>
  );
}

/**
 * A member's number on its top-left corner, for a remark elsewhere that refers to it. It is
 * drawn over the record's outline, and fades with the member.
 */
export function Pin({ node, state }: { node: CompiledNode; state: ElementState }) {
  const { x, y } = node.rect;
  return (
    // biome-ignore lint/a11y/noAriaHiddenOnFocusable: The pin only paints; the member is the element.
    <g
      aria-hidden="true"
      {...stylex.props(
        roleStyle(node.role),
        categoryStyle(node.category),
        styles.passThrough,
        elementStyles.fade,
        stateStyle(state),
      )}
    >
      <circle cx={x} cy={y} r={badge.radius + 1} {...stylex.props(styles.pin)} />
      <text
        x={x}
        y={y}
        fontSize={m.tabSize}
        fontWeight={m.labelWeight}
        {...stylex.props(elementStyles.text, elementStyles.sans, styles.pinText)}
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
  state: ElementState;
}) {
  const { x, y, width: w, height: h } = node.rect;
  return (
    // biome-ignore lint/a11y/noAriaHiddenOnFocusable: The outline only paints; the record's body is the element.
    <g
      aria-hidden="true"
      {...stylex.props(
        roleStyle(node.role),
        categoryStyle(node.category),
        styles.passThrough,
        elementStyles.fade,
        stateStyle(state),
      )}
    >
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={corner.shape}
        {...stylex.props(styles.outlineOnly, node.role === "external" && elementStyles.dashed)}
      />
      {node.divider !== undefined && (
        <path d={shape.rule(node.rect, node.divider)} {...stylex.props(styles.rule)} />
      )}
      {node.rules && <path d={shape.segments(node.rules)} {...stylex.props(styles.rule)} />}
      {node.role === "warning" && <WarningBadge node={node} />}
      {flagged && (
        <rect {...shape.outline(node.rect, 4)} rx={8} {...stylex.props(elementStyles.flag)} />
      )}
    </g>
  );
}

/** The outline of a node's shape, drawn in its role's ink and fill. */
function Shape({ node, clip }: { node: CompiledNode; clip: string }) {
  const r = node.rect;
  const { x, y, width: w, height: h } = r;
  const outlined = stylex.props(styles.shape, node.role === "external" && elementStyles.dashed);
  switch (node.shape) {
    case "box":
      return <rect x={x} y={y} width={w} height={h} rx={corner.shape} {...outlined} />;
    case "cylinder": {
      const { body, cap } = shape.cylinder(r);
      return (
        <>
          <path d={body} {...outlined} />
          <ellipse {...cap} {...outlined} />
        </>
      );
    }
    case "queue": {
      const { body, cap } = shape.queue(r);
      return (
        <>
          <path d={body} {...outlined} />
          <ellipse {...cap} {...outlined} />
        </>
      );
    }
    case "io":
      return <polygon points={shape.pointList(shape.parallelogram(r))} {...outlined} />;
    case "doc":
      return <path d={shape.page(r)} {...outlined} />;
    case "actor": {
      const { head, body } = shape.actor(r);
      return (
        <g {...stylex.props(styles.figure)}>
          <circle {...head} />
          <path d={body} />
        </g>
      );
    }
    case "note": {
      const { body, fold } = shape.note(r);
      return (
        <>
          <path d={body} {...outlined} />
          <path d={fold} {...stylex.props(styles.fold)} />
        </>
      );
    }
    case "diamond":
      return <polygon points={shape.pointList(shape.diamond(r))} {...outlined} />;
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
          <rect x={x} y={y} width={w} height={h} rx={corner.shape} {...outlined} />
          {node.divider !== undefined && (
            <path d={shape.rule(r, node.divider)} {...stylex.props(styles.rule)} />
          )}
        </>
      );
    case "cell": {
      const filled = node.role !== "default" || node.category !== undefined;
      return (
        <g clipPath={node.parent ? `url(#${clip}-${node.parent})` : undefined}>
          <rect
            {...shape.outline(r, 0)}
            {...stylex.props(filled ? styles.cellFill : styles.hitArea)}
          />
          <rect {...shape.outline(r, -2)} {...stylex.props(styles.cellRing)} />
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
  /** A layer that only paints: the pointer reaches the element under it. */
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
