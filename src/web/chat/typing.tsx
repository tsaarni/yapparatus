import * as stylex from "@stylexjs/stylex";
import { styled } from "../style/styled.ts";
import { radius, space, theme } from "../style/theme.stylex.ts";

/** Three dots that rise in turn while an agent has the message or works on it, as in a messaging app. */
export function Typing({ label }: { label: string }) {
  return (
    <p role="status" aria-label={label} title={label} {...styled("working", s.typing)}>
      <span {...stylex.props(s.typingDot)} />
      <span {...stylex.props(s.typingDot, s.typingDot2)} />
      <span {...stylex.props(s.typingDot, s.typingDot3)} />
    </p>
  );
}

const rise = stylex.keyframes({
  "0%": { opacity: 0.35, transform: "translateY(0)" },
  "30%": { opacity: 1, transform: "translateY(-4px)" },
  "60%": { opacity: 0.35, transform: "translateY(0)" },
  "100%": { opacity: 0.35, transform: "translateY(0)" },
});

const s = stylex.create({
  typing: {
    display: "inline-flex",
    alignItems: "center",
    gap: space.xs,
    margin: 0,
    paddingBlock: space.sm,
    paddingInline: space.md,
    borderRadius: radius.full,
    backgroundColor: theme.surfaceRaised,
  },
  typingDot: {
    width: space.sm,
    height: space.sm,
    borderRadius: radius.full,
    backgroundColor: theme.textMuted,
    animationName: rise,
    animationDuration: "1.2s",
    animationIterationCount: "infinite",
  },
  typingDot2: {
    animationDelay: "0.15s",
  },
  typingDot3: {
    animationDelay: "0.3s",
  },
});
