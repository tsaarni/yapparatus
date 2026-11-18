/** The keyboard focus ring shared by every focusable element. */

import * as stylex from "@stylexjs/stylex";
import { theme } from "./theme.stylex.ts";

/** The keyboard focus ring that every control and focusable element shows. */
export const focus = stylex.create({
  ring: {
    outlineStyle: { default: "none", ":focus-visible": "solid" },
    outlineWidth: 2,
    outlineColor: theme.accentStrong,
    outlineOffset: 2,
  },
});
