import * as stylex from "@stylexjs/stylex";
import { useEffect, useRef, useState } from "react";
import { Button } from "../style/button.tsx";
import { styled } from "../style/styled.ts";
import { fontSize, layer, radius, sizes, space, theme, when } from "../style/theme.stylex.ts";

/** Notices and errors, at the bottom of the screen. */
export function Notifications({
  notice,
  onDismissNotice,
  error,
  onDismissError,
}: {
  notice: { text: string; id: number } | undefined;
  onDismissNotice: () => void;
  error: string;
  onDismissError: () => void;
}) {
  return (
    <div {...styled("notifications", s.notifications)} aria-live="polite">
      {notice && <Notice key={notice.id} text={notice.text} onDismiss={onDismissNotice} />}
      {error && (
        <p {...stylex.props(s.toast, s.toastError)} role="alert">
          {error}
          <Button size="small" variant="ghost" onClick={onDismissError}>
            Dismiss
          </Button>
        </p>
      )}
    </div>
  );
}

/**
 * A notice tells the reader something and goes away by itself: after a few seconds, on
 * Escape, or on Dismiss. Pointing at it holds it open. Errors stay until dismissed.
 */
function Notice({ text, onDismiss }: { text: string; onDismiss: () => void }) {
  const [held, setHeld] = useState(false);
  // The parent passes a new function each render; the timer must not restart with it.
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  useEffect(() => {
    if (held) return;
    const timer = window.setTimeout(() => dismiss.current(), 4000);
    return () => window.clearTimeout(timer);
  }, [held]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <p
      {...styled("notice", s.toast)}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
    >
      {text}
      <Button size="small" variant="ghost" onClick={onDismiss}>
        Dismiss
      </Button>
    </p>
  );
}

const s = stylex.create({
  notifications: {
    position: "fixed",
    zIndex: layer.toast,
    bottom: space.xl,
    left: "50%",
    transform: "translateX(-50%)",
    display: { default: "grid", [when.print]: "none" },
    gap: space.sm,
    width: `min(${sizes.textWidth}, calc(100vw - ${space.xl2}))`,
    pointerEvents: "none",
  },
  toast: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
    margin: 0,
    paddingBlock: space.sm,
    paddingInline: `${space.lg} ${space.sm}`,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: theme.borderStrong,
    backgroundColor: theme.surfaceRaised,
    boxShadow: theme.shadowRaised,
    color: theme.text,
    fontSize: fontSize.sm,
    pointerEvents: "auto",
  },
  toastError: { color: theme.error, borderColor: theme.errorBorder },
});
