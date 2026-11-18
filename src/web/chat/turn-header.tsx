import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";
import { fontSize, fontWeight, space, theme } from "../style/theme.stylex.ts";

function time(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** A turn's header: who wrote it on the left, details and the time on the right. */
export function TurnHeader({
  author,
  detail,
  message,
}: {
  author: string;
  detail?: ReactNode;
  message?: { seq: number; createdAt: string };
}) {
  return (
    <header {...stylex.props(s.meta)}>
      <span {...stylex.props(s.author)}>{author}</span>
      <span {...stylex.props(s.metaEnd)}>
        {detail}
        {detail && message && <span aria-hidden="true">·</span>}
        {message && (
          <time dateTime={message.createdAt} title={new Date(message.createdAt).toLocaleString()}>
            {time(message.createdAt)}
          </time>
        )}
      </span>
    </header>
  );
}

const s = stylex.create({
  meta: {
    display: "flex",
    alignItems: "baseline",
    gap: space.sm,
    marginBottom: space.xs,
    color: theme.textMuted,
    fontSize: fontSize.xs,
    fontVariantNumeric: "tabular-nums",
  },
  author: {
    color: theme.textBody,
    fontWeight: fontWeight.semibold,
  },
  metaEnd: {
    display: "flex",
    gap: space.xs,
    minWidth: 0,
    marginLeft: "auto",
    whiteSpace: "nowrap",
  },
});
