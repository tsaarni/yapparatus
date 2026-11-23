/**
 * Chart text measured in the browser with a hidden SVG text, which takes CSS variables as font
 * families and sets tabular digits, as the drawing does. A canvas can do neither.
 */
import type { ChartFont } from "../../chart/text-box.ts";
import type { FontSpec, Measure } from "../../diagram/metrics.ts";

let probe: SVGTextElement | undefined;
const widths = new Map<string, number>();

/** The hidden text that measures, made on first use. */
function textProbe(): SVGTextElement {
  if (probe?.isConnected) return probe;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("style", "position:absolute;left:-10000px;top:0;width:0;height:0;");
  probe = document.createElementNS("http://www.w3.org/2000/svg", "text");
  svg.append(probe);
  document.body.append(svg);
  return probe;
}

/** Set the probe's font and text. */
function setText(text: string, font: FontSpec): SVGTextElement {
  const element = textProbe();
  element.setAttribute(
    "style",
    `font-family:${font.family};font-size:${font.size}px;font-weight:${font.weight};font-variant-numeric:${font.tabular ? "tabular-nums" : "normal"}`,
  );
  element.textContent = text;
  return element;
}

/** Text width in the browser, as an SVG text is set. Widths are kept, so fonts must be loaded. */
export const measureText: Measure = (text, font) => {
  const key = `${font.family}|${font.size}|${font.weight}|${font.tabular ?? false}|${text}`;
  let width = widths.get(key);
  if (width === undefined) {
    width = setText(text, font).getComputedTextLength();
    widths.set(key, width);
  }
  return width;
};

/** A chart font with its ascent and descent, read from how the browser sets a line of it. */
export function chartFont(family: string, size: number, weight: number): ChartFont {
  const box = setText("Hg", { family, size, weight }).getBBox();
  return { family, size, weight, ascent: -box.y / size, descent: (box.y + box.height) / size };
}
