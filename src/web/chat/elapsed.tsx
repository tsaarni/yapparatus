import { useEffect, useState } from "react";
import { styled } from "../style/styled.ts";

/** "9 s", "2 min 5 s": how long a reply took. */
export function lasted(ms: number) {
  const seconds = Math.max(1, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  return seconds % 60 ? `${minutes} min ${seconds % 60} s` : `${minutes} min`;
}

/** Seconds since `since`, counting up while the agent works. */
export function Elapsed({ since }: { since: string }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <span {...styled("elapsed")} title="Since your newest message">
      {lasted(now - new Date(since).getTime())}
    </span>
  );
}
