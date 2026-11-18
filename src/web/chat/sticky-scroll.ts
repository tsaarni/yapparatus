import { type RefObject, useCallback, useEffect, useRef } from "react";

const scrollKey = "yapparatus:chat-scroll";

/**
 * Scroll like a messaging app. At the bottom, the thread stays at the bottom as messages
 * arrive and replies finish rendering; scrolled up, nothing moves it. The position survives
 * remounts and reloads. Returns a function that jumps to the bottom and keeps following,
 * for sending: the new message may render before the scroll event says the thread is at the
 * bottom, and the thread must follow it anyway.
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
    // Messages arrive after mounting, so a saved position is applied once the thread is tall
    // enough to have it.
    let restore: number | undefined = stick ? undefined : saved.top;
    const follow = () => {
      if (stick) element.scrollTop = element.scrollHeight;
      else if (restore !== undefined && element.scrollHeight - element.clientHeight >= restore) {
        element.scrollTop = restore;
        restore = undefined;
      }
    };
    follow();
    // Only the reader leaves the bottom. The browser also scrolls when the content or the
    // thread changes size, such as when the message box shrinks after sending, and its scroll
    // event can arrive after newer content rendered: read as the reader's, it would stop the
    // thread from following the reply or the typing dots.
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
