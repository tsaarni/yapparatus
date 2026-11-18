import { useCallback, useEffect, useRef, useState } from "react";

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
