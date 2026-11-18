/** Scrolling for the chat thread, which follows new messages while at the bottom. */

import { type RefObject, useCallback, useEffect, useRef } from "react";

const scrollKey = "yapparatus:chat-scroll";

/**
 * Keep the thread at the bottom while it is there, and its position across reloads. Returns a
 * function that jumps to the bottom and follows, for sending before the scroll event arrives.
 */
export function useStickyScroll(thread: RefObject<HTMLDivElement | null>): () => void {
  const toBottom = useRef(() => {});
  useEffect(() => {
    const element = thread.current;
    const content = element?.firstElementChild;
    if (!element || !content) return;
    const atBottom = () => element.scrollHeight - element.scrollTop - element.clientHeight < 40;
    let saved: { top: number; bottom: boolean } = { top: 0, bottom: true };
    try {
      saved = JSON.parse(sessionStorage.getItem(scrollKey) ?? "") ?? saved;
    } catch {}
    let stick = saved.bottom;
    let restore: number | undefined = stick ? undefined : saved.top;
    const follow = () => {
      if (stick) element.scrollTop = element.scrollHeight;
      else if (restore !== undefined && element.scrollHeight - element.clientHeight >= restore) {
        element.scrollTop = restore;
        restore = undefined;
      }
    };
    follow();
    let readerAt = Number.NEGATIVE_INFINITY;
    const reader = () => {
      readerAt = performance.now();
    };
    const intents = ["wheel", "touchmove", "keydown", "pointerdown"] as const;
    for (const type of intents) element.addEventListener(type, reader, { passive: true });
    const onScroll = () => {
      if (restore !== undefined) return;
      const bottom = atBottom();
      if (bottom || performance.now() - readerAt < 1000) stick = bottom;
      sessionStorage.setItem(scrollKey, JSON.stringify({ top: element.scrollTop, bottom: stick }));
    };
    toBottom.current = () => {
      restore = undefined;
      stick = true;
      element.scrollTop = element.scrollHeight;
    };
    const resized = new ResizeObserver(follow);
    resized.observe(content);
    element.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      resized.disconnect();
      element.removeEventListener("scroll", onScroll);
      for (const type of intents) element.removeEventListener(type, reader);
    };
  }, [thread]);
  return useCallback(() => toBottom.current(), []);
}
