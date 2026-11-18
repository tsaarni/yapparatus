/** The brief outline that marks a target the reader arrived at. */

import * as stylex from "@stylexjs/stylex";
import { flashElement } from "../diagram/element.tsx";
import { radius, space, theme } from "../style/theme.stylex.ts";

/** Briefly mark a target the reader just arrived at. */
export function flash(element: Element) {
  if (element instanceof SVGElement) return flashElement(element);
  const classes = stylex.props(s.highlight).className?.split(" ") ?? [];
  element.classList.add(...classes);
  window.setTimeout(() => element.classList.remove(...classes), 1800);
}

const s = stylex.create({
  highlight: {
    outlineWidth: 2,
    outlineStyle: "solid",
    outlineColor: theme.accentStrong,
    outlineOffset: space.sm,
    borderRadius: radius.sm,
  },
});
