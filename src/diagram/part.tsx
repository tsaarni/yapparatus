/**
 * What every drawn part shares: its state in a step, its role and category colors, its text
 * lines, and its address as a link and a button.
 */
import * as stylex from "@stylexjs/stylex";
import { partSeparator } from "../document.ts";
import { dash, duration, stroke, theme, when } from "../reader/theme.stylex.ts";
import type { TextLine } from "./compiled.ts";
import type { Rect } from "./geometry.ts";
import type { Role } from "./scene.ts";

/** How a part looks in the current step. "absent" is a step-only part outside its steps. */
export type PartState = "focus" | "dim" | "hidden" | "absent" | undefined;

/**
 * Diagram parts are targets: a namespaced DOM id (`figure--part`) makes them linkable.
 * Parts are buttons while editing (to ask about them) and when a step explains them.
 */
export function interactive(
  id: string,
  label: string,
  figure: string | undefined,
  button: boolean,
) {
  return {
    ...(figure ? { id: `${figure}${partSeparator}${id}` } : {}),
    "data-element-id": id,
    "data-target": "diagram-part",
    "data-title": label,
    "aria-label": label,
    ...(button ? { role: "button", tabIndex: 0 } : {}),
  };
}

export type Target = ReturnType<typeof interactive>;

/** Focused parts are drawn heavier; others fade; parts not yet built are hidden. */
export function stateStyle(state: PartState): stylex.StyleXStyles | null {
  return state === "focus"
    ? (partStyles.focused as stylex.StyleXStyles)
    : state === "dim"
      ? partStyles.dimmed
      : state === "hidden"
        ? partStyles.hidden
        : state === "absent"
          ? partStyles.absent
          : null;
}

/** Briefly mark a part the reader arrived at: heavier, with the focus ring around it. */
export function flashPart(element: SVGElement) {
  const classes = stylex.props(partStyles.arrived).className?.split(" ") ?? [];
  element.classList.add(...classes);
  window.setTimeout(() => element.classList.remove(...classes), 1800);
}

/** Hidden parts leave the tab order. The state is also an attribute, for scrolling into view. */
export function targetFor(target: Target | undefined, state: PartState) {
  const marked = state ? { "data-state": state } : {};
  if (!target) return marked;
  return state === "hidden" || state === "absent"
    ? { ...target, ...marked, tabIndex: -1, "aria-hidden": true }
    : { ...target, ...marked };
}

/** Text exactly as the compiler measured it: its size, weight, and position. */
export function Line({ line, halo = false }: { line: TextLine; halo?: boolean }) {
  return (
    <text
      x={line.x}
      y={line.y}
      fontSize={line.size}
      fontWeight={line.weight}
      {...stylex.props(
        partStyles.text,
        line.mono ? partStyles.mono : partStyles.sans,
        line.align === "start" && partStyles.start,
        line.muted && partStyles.muted,
        halo && partStyles.halo,
      )}
    >
      {line.text}
    </text>
  );
}

export function Lines({ lines }: { lines: TextLine[] }) {
  // biome-ignore lint/suspicious/noArrayIndexKey: Lines are positional.
  return lines.map((line, i) => <Line key={i} line={line} />);
}

export function outline(r: Rect, pad: number) {
  return { x: r.x - pad, y: r.y - pad, width: r.width + 2 * pad, height: r.height + 2 * pad };
}

/**
 * A part's role, the same for shapes, edges, and enclosures: its ink, fill, label color, and
 * stroke weight, as custom properties that the shape and line styles read.
 */
export function roleStyle(role: Role): stylex.StyleXStyles {
  switch (role) {
    case "accent":
      return partStyles.roleAccent as stylex.StyleXStyles;
    case "warning":
      return partStyles.roleWarning as stylex.StyleXStyles;
    case "muted":
      return partStyles.roleMuted as stylex.StyleXStyles;
    default:
      return partStyles.roleDefault as stylex.StyleXStyles;
  }
}

/** A category's color, by its slot in the legend. */
export function categoryStyle(slot: number | undefined): stylex.StyleXStyles | null {
  switch (slot) {
    case 1:
      return partStyles.category1 as stylex.StyleXStyles;
    case 2:
      return partStyles.category2 as stylex.StyleXStyles;
    case 3:
      return partStyles.category3 as stylex.StyleXStyles;
    case 4:
      return partStyles.category4 as stylex.StyleXStyles;
    default:
      return null;
  }
}

/** Shape corners, by kind. */
export const corner = { shape: 6, group: 10, frame: 4, mark: 3 };

/** The warning badge on a part's corner. */
export const badge = { radius: 7 };

export const partStyles = stylex.create({
  /**
   * Parts that can be pointed at. Hover draws the part heavier, keeping its color; keyboard
   * focus draws the reader's focus ring, as everywhere else in the app.
   */
  target: {
    cursor: { default: "inherit", ":is([role=button])": "pointer" },
    outlineStyle: { default: "none", ":focus-visible": "solid" },
    outlineWidth: 2,
    outlineColor: theme.accentStrong,
    outlineOffset: 3,
    "--boost": { default: "0px", ":hover": stroke.boost, ":focus-visible": stroke.boost },
  },
  fade: {
    transitionProperty: "opacity",
    transitionDuration: duration.slow,
  },
  /** A part a step is about: heavier, in its own color, while the others fade. */
  focused: {
    "--boost": stroke.boost,
  },
  /** A part the reader just arrived at, by a link or Show on page. */
  arrived: {
    "--boost": stroke.boost,
    outlineStyle: "solid",
    outlineWidth: 2,
    outlineColor: theme.accentStrong,
    outlineOffset: 3,
  },
  dimmed: { opacity: { default: 0.35, [when.print]: 1 } },
  hidden: {
    opacity: { default: 0, [when.print]: 1 },
    pointerEvents: "none",
  },
  /** Step-only parts outside their steps: gone on screen and in print. */
  absent: {
    opacity: 0,
    pointerEvents: "none",
  },
  // Roles. Every kind of part reads the same properties, so a role means the same everywhere.
  roleDefault: {
    "--ink": theme.borderControl,
    "--fill": theme.surfaceRaised,
    "--label": theme.text,
    "--weight": stroke.line,
  },
  roleAccent: {
    "--ink": theme.accent,
    "--fill": theme.accentSurface,
    "--label": theme.text,
    // The accent is also heavier, so it stands out without its color.
    "--weight": stroke.strong,
  },
  roleWarning: {
    "--ink": theme.warning,
    "--fill": theme.warningSurface,
    "--label": theme.text,
    "--weight": stroke.line,
  },
  // Category colors: they replace a role's hue and keep its weight, badge, and dashes.
  category1: { "--ink": theme.category1, "--fill": theme.category1Surface },
  category2: { "--ink": theme.category2, "--fill": theme.category2Surface },
  category3: { "--ink": theme.category3, "--fill": theme.category3Surface },
  category4: { "--ink": theme.category4, "--fill": theme.category4Surface },
  roleMuted: {
    "--ink": theme.borderStrong,
    "--fill": "transparent",
    "--label": theme.textMuted,
    "--weight": stroke.hairline,
  },
  dashed: { strokeDasharray: dash.dashed },
  text: {
    fill: `var(--label, ${theme.text})`,
    textAnchor: "middle",
    dominantBaseline: "central",
  },
  sans: { fontFamily: theme.sans },
  mono: { fontFamily: theme.mono },
  start: { textAnchor: "start" },
  muted: { fill: theme.textMuted },
  /** A halo in the figure's own color keeps text readable over lines. */
  halo: {
    paintOrder: "stroke",
    stroke: `var(--figure-bg, ${theme.surface})`,
    strokeWidth: 5,
    strokeLinejoin: "round",
  },
  flag: {
    fill: "none",
    stroke: theme.warning,
    strokeWidth: stroke.hairline,
    strokeDasharray: dash.dotted,
  },
});
