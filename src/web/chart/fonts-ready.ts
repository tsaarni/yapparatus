/**
 * Waiting for the web app's fonts in the browser. A chart measures its tick labels only after
 * the fonts are ready.
 */
import { useEffect, useState } from "react";
import { defaultMetrics as m } from "../../diagram/metrics.ts";

const fontQueries = [
  ...[m.textWeight, m.edgeWeight, m.labelWeight].map((w) => `${w} ${m.labelSize}px ${m.sans}`),
  `${m.textWeight} ${m.smallSize}px ${m.mono}`,
];
let fontsLoaded = false;

/** Measurement is only meaningful with the real fonts, so wait for them once. */
export function useFontsReady() {
  const [ready, setReady] = useState(fontsLoaded);
  useEffect(() => {
    if (ready) return;
    let live = true;
    Promise.all(fontQueries.map((q) => document.fonts.load(q)))
      .catch(() => undefined)
      .then(() => {
        fontsLoaded = true;
        if (live) setReady(true);
      });
    return () => {
      live = false;
    };
  }, [ready]);
  return ready;
}
