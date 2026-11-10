/**
 * Fonts in the browser: waiting for the diagram fonts to load, and measuring text with them.
 * Diagrams and charts measure text only after the fonts are ready.
 */
import { useEffect, useState } from "react";
import { defaultMetrics, type Measure } from "./metrics.ts";

let context: CanvasRenderingContext2D | null | undefined;

export const canvasMeasure: Measure = (text, font) => {
  context ??= document.createElement("canvas").getContext("2d");
  if (!context) return text.length * font.size * 0.55;
  context.font = `${font.weight} ${font.size}px ${font.family}`;
  return context.measureText(text).width;
};

const m = defaultMetrics;
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
