import * as stylex from "@stylexjs/stylex";
import { type ComponentProps, useCallback, useEffect, useRef, useState } from "react";
import {
  duration,
  fontSize,
  fontWeight,
  lineHeight,
  radius,
  sizes,
  space,
  theme,
} from "./theme.stylex.ts";

/** Keep semantic class names as test and debugging hooks, separate from visual styles. */
export function styled(
  className: string,
  ...values: Array<stylex.StyleXStyles | false | null | undefined>
) {
  const props = stylex.props(...values);
  return {
    ...(props.style ? { style: props.style } : {}),
    className: `${className} ${props.className ?? ""}`.trim(),
  };
}

export const ui = stylex.create({
  focus: {
    outlineStyle: { default: "none", ":focus-visible": "solid" },
    outlineWidth: 2,
    outlineColor: theme.accentStrong,
    outlineOffset: 2,
  },
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
    // Transparent, not absent: forced-colors mode draws it, so the button keeps an edge.
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

interface ButtonProps extends ComponentProps<"button"> {
  variant?: "default" | "primary" | "danger" | "ghost" | "icon";
  size?: "default" | "small";
}

export function Button({ variant = "default", size, className = "", ...props }: ButtonProps) {
  return (
    <button
      type="button"
      {...props}
      {...styled(
        className,
        ui.button,
        ui.focus,
        variant === "primary" && ui.primary,
        variant === "danger" && ui.danger,
        (variant === "ghost" || variant === "icon") && ui.ghost,
        variant === "icon" && ui.icon,
        size === "small" && ui.small,
        variant === "icon" && size === "small" && ui.smallIcon,
      )}
    />
  );
}

/** What a copy button shows: its label, a moment of "copied", or a moment of "failed". */
export type CopyState = "idle" | "copied" | "failed";

/**
 * Copy text from a button and confirm on the button itself, for success and failure alike.
 * Resolves once the clipboard has answered: true when the text was copied.
 */
export function useCopy() {
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<number>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const copy = useCallback(async (text: string) => {
    let copied = false;
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch {
      // No clipboard (an insecure origin) or permission refused: the button says so.
    }
    setState(copied ? "copied" : "failed");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState("idle"), 1400);
    return copied;
  }, []);
  return [state, copy] as const;
}
