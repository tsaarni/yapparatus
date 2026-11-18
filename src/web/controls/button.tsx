/** The Button control, in the app's variants and sizes. */

import * as stylex from "@stylexjs/stylex";
import type { ComponentProps } from "react";
import { focus } from "../style/focus.ts";
import { styled } from "../style/styled.ts";
import {
  duration,
  fontSize,
  fontWeight,
  lineHeight,
  radius,
  sizes,
  space,
  theme,
} from "../style/theme.stylex.ts";

interface ButtonProps extends ComponentProps<"button"> {
  variant?: "default" | "primary" | "danger" | "ghost" | "icon";
  size?: "default" | "small";
}

/** A button styled as one of the app's variants; its type defaults to "button". */
export function Button({ variant = "default", size, className = "", ...props }: ButtonProps) {
  return (
    <button
      type="button"
      {...props}
      {...styled(
        className,
        s.button,
        focus.ring,
        variant === "primary" && s.primary,
        variant === "danger" && s.danger,
        (variant === "ghost" || variant === "icon") && s.ghost,
        variant === "icon" && s.icon,
        size === "small" && s.small,
        variant === "icon" && size === "small" && s.smallIcon,
      )}
    />
  );
}

const s = stylex.create({
  button: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
    minHeight: sizes.control,
    paddingBlock: space.xs,
    paddingInline: space.md,
    borderWidth: 1,
    borderStyle: "solid",
    borderRadius: radius.md,
    fontFamily: theme.sans,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    lineHeight: lineHeight.tight,
    whiteSpace: "nowrap",
    cursor: { default: "pointer", ":disabled": "default" },
    opacity: { default: 1, ":disabled": 0.45 },
    transitionProperty: "background-color, border-color, color",
    transitionDuration: duration.fast,
    color: { default: theme.textBody, ":hover": theme.text },
    backgroundColor: { default: theme.surfaceRaised, ":hover": theme.surfaceHover },
    borderColor: { default: theme.border, ":hover": theme.borderStrong },
  },
  primary: {
    color: { default: theme.canvas, ":hover": theme.canvas },
    backgroundColor: { default: theme.accent, ":hover": theme.accentStrong },
    borderColor: { default: theme.accent, ":hover": theme.accentStrong },
    fontWeight: fontWeight.semibold,
  },
  ghost: {
    color: { default: theme.textMuted, ":hover": theme.text },
    backgroundColor: { default: "transparent", ":hover": theme.surfaceHover },
    /** Transparent, not absent: forced-colors mode draws it, so the button keeps an edge. */
    borderColor: "transparent",
  },
  icon: {
    width: sizes.control,
    paddingInline: 0,
  },
  danger: {
    color: theme.error,
    backgroundColor: theme.errorSurface,
    borderColor: { default: theme.errorBorder, ":hover": theme.error },
    fontWeight: fontWeight.semibold,
  },
  small: {
    minHeight: sizes.controlSmall,
    paddingInline: space.sm,
    fontSize: fontSize.xs,
  },
  smallIcon: {
    width: sizes.controlSmall,
    paddingInline: 0,
  },
});
