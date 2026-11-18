/**
 * What every drawn element shares: its state in a step, its role and category colors, its text
 * lines, and its address as a link and a button.
 */

import * as stylex from "@stylexjs/stylex";
import type { ElementState, TextLine } from "../../diagram/drawing.ts";
import type { Role } from "../../diagram/elements.ts";
import { elementSeparator } from "../../document/address.ts";
import { dash, duration, stroke, theme, when } from "../style/theme.stylex.ts";

/**
 * Diagram elements are targets: a namespaced DOM id (`figure--element`) makes them linkable.
 * Elements are buttons while editing (to comment on them) and when a step explains them.
 */
export function interactive(
  id: string,
  label: string,
  figure: string | undefined,
  button: boolean,
) {
  return {
    ...(figure ? { id: `${figure}${elementSeparator}${id}` } : {}),
    "data-element-id": id,
    "data-target": "diagram-element",
    "data-title": label,
    "aria-label": label,
    ...(button ? { role: "button", tabIndex: 0 } : {}),
  };
}

/** The attributes that make a diagram element a target. */
export type Target = ReturnType<typeof interactive>;

/** Focused elements are drawn heavier; others fade; elements not yet built are hidden. */
export function stateStyle(state: ElementState): stylex.StyleXStyles | null {
  return state === "focus"
    ? (elementStyles.focused as stylex.StyleXStyles)
    : state === "dim"
      ? elementStyles.dimmed
      : state === "hidden"
        ? elementStyles.hidden
        : state === "absent"
          ? elementStyles.absent
          : null;
}

/** Briefly mark an element the reader arrived at: heavier, with the focus ring around it. */
export function flashElement(element: SVGElement) {
  const classes = stylex.props(elementStyles.arrived).className?.split(" ") ?? [];
  element.classList.add(...classes);
  window.setTimeout(() => element.classList.remove(...classes), 1800);
}

/** Hidden elements leave the tab order. The state is also an attribute, for scrolling into view. */
export function targetFor(target: Target | undefined, state: ElementState) {
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
        elementStyles.text,
        line.mono ? elementStyles.mono : elementStyles.sans,
        line.align === "start" && elementStyles.start,
        line.muted && elementStyles.muted,
        halo && elementStyles.halo,
      )}
    >
      {line.text}
    </text>
  );
}

/** An element's text lines, as the compiler measured them. */
export function Lines({ lines }: { lines: TextLine[] }) {
  // biome-ignore lint/suspicious/noArrayIndexKey: Lines are positional.
  return lines.map((line, i) => <Line key={i} line={line} />);
}

/**
 * An element's role, the same for shapes, edges, and enclosures: its ink, fill, label color, and
 * stroke weight, as custom properties that the shape and line styles read.
 */
export function roleStyle(role: Role): stylex.StyleXStyles {
  switch (role) {
    case "accent":
      return elementStyles.roleAccent as stylex.StyleXStyles;
    case "warning":
      return elementStyles.roleWarning as stylex.StyleXStyles;
    case "muted":
      return elementStyles.roleMuted as stylex.StyleXStyles;
    default:
      return elementStyles.roleDefault as stylex.StyleXStyles;
  }
}

/** A category's color, by its slot in the legend. */
export function categoryStyle(slot: number | undefined): stylex.StyleXStyles | null {
  switch (slot) {
    case 1:
      return elementStyles.category1 as stylex.StyleXStyles;
    case 2:
      return elementStyles.category2 as stylex.StyleXStyles;
    case 3:
      return elementStyles.category3 as stylex.StyleXStyles;
    case 4:
      return elementStyles.category4 as stylex.StyleXStyles;
    default:
      return null;
  }
}

/** The styles every kind of diagram element shares. */
export const elementStyles = stylex.create({
  /**
   * Elements that can be pointed at. Hover draws the element heavier, keeping its color; keyboard
   * focus draws the focus ring, as everywhere else in the web app.
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
  /** An element a step is about: heavier, in its own color, while the others fade. */
  focused: {
    "--boost": stroke.boost,
  },
  /** An element the reader just arrived at, by a link or Show on page. */
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
  /** Step-only elements outside their steps: gone on screen and in print. */
  absent: {
    opacity: 0,
    pointerEvents: "none",
  },
  /** Roles. Every kind of element reads the same properties, so a role looks the same anywhere. */
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
    /** The accent is also heavier, so it stands out without its color. */
    "--weight": stroke.strong,
  },
  roleWarning: {
    "--ink": theme.warning,
    "--fill": theme.warningSurface,
    "--label": theme.text,
    "--weight": stroke.line,
  },
  /** Category colors: they replace a role's hue and keep its weight, badge, and dashes. */
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
