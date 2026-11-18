import * as stylex from "@stylexjs/stylex";
import type { HTMLAttributes } from "react";
import type { AlertKind } from "../../document/page-module.ts";
import { AppIcon as Icon } from "../controls/app-icon.tsx";
import { styled } from "../style/styled.ts";
import { fontSize, fontWeight, radius, space, theme } from "../style/theme.stylex.ts";

const alertTitles: Record<AlertKind, string> = {
  note: "Note",
  tip: "Tip",
  important: "Important",
  warning: "Warning",
  caution: "Caution",
};

/** A blockquote, or with `> [!NOTE]` and the like as its first line, an alert of that kind. */
export function Blockquote({
  children,
  ...props
}: HTMLAttributes<HTMLElement> & { "data-alert"?: AlertKind }) {
  const kind = props["data-alert"];
  if (!kind)
    return (
      <blockquote {...props} {...stylex.props(s.blockquote)}>
        {children}
      </blockquote>
    );
  return (
    <div role="note" {...props} {...styled("alert", s.alert, alertStyles[kind])}>
      <p {...stylex.props(s.alertTitle)}>
        <Icon name={kind} size={16} />
        {alertTitles[kind]}
      </p>
      {children}
    </div>
  );
}

const s = stylex.create({
  alert: {
    marginBlock: space.xl,
    paddingBlock: `${space.md} ${space.xxs}`,
    paddingInline: space.lg,
    borderLeftWidth: 3,
    borderLeftStyle: "solid",
    borderRadius: radius.md,
    color: theme.textBody,
    breakInside: "avoid",
  },
  alertTitle: {
    display: "flex",
    alignItems: "center",
    gap: space.sm,
    margin: 0,
    marginBottom: space.xs,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: "var(--alert-ink)",
  },
  blockquote: {
    marginBlock: space.xl,
    marginInline: 0,
    paddingLeft: space.lg,
    borderLeftWidth: 2,
    borderLeftStyle: "solid",
    borderLeftColor: theme.accentBorder,
    color: theme.textMuted,
  },
});

/** Each alert kind's color, for its border, tint, and title. */
const alertStyles = stylex.create({
  note: {
    borderLeftColor: theme.accent,
    backgroundColor: theme.accentSurface,
    "--alert-ink": theme.accent,
  },
  tip: {
    borderLeftColor: theme.success,
    backgroundColor: `color-mix(in srgb, ${theme.success} 8%, transparent)`,
    "--alert-ink": theme.success,
  },
  important: {
    borderLeftColor: theme.accentStrong,
    backgroundColor: theme.accentSurface,
    "--alert-ink": theme.accentStrong,
  },
  warning: {
    borderLeftColor: theme.warning,
    backgroundColor: theme.warningSurface,
    "--alert-ink": theme.warning,
  },
  caution: {
    borderLeftColor: theme.error,
    backgroundColor: theme.errorSurface,
    "--alert-ink": theme.error,
  },
});
