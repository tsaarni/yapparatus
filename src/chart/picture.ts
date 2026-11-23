/**
 * A chart's drawing as a standalone SVG picture for an agent: text as glyph outlines, literal
 * colors only, and the legend drawn under it, so a rasterizer needs no fonts or styles.
 */
import type { Picture, PictureFonts } from "../diagram/picture.ts";
import type { ChartDrawing } from "./drawing.ts";
import { amountFormat, type ChartLegend } from "./legend.ts";
import type { ChartPaint } from "./paint.ts";
import { type ChartFont, textRuns } from "./text-box.ts";

const svgNamespace = "http://www.w3.org/2000/svg";

/** The legend under the chart, as the web app lays out its buttons and its ramp. */
const legend = {
  marginTop: 12,
  height: 28,
  padX: 9,
  gap: 4,
  swatch: { width: 14, height: 10, radius: 4 },
  font: { size: 12, weight: 500 },
  ramp: { width: 64, gap: 8, weight: 400, stops: 8 },
};

/** Attributes a `<text>` sets that only text has: its position, anchor, and font. */
const textOnly = /^(x|y|dx|dy|text-anchor|font-.*|dominant-baseline)$/;

/** Set attributes on an element. */
function set(element: Element, attributes: Record<string, string | number>) {
  for (const [name, value] of Object.entries(attributes))
    element.setAttribute(name, String(Math.round(Number(value) * 100) / 100 || value));
}

/**
 * A color a renderer without CSS can read: `currentColor` as the paint's text color, Plot's
 * background as the surface, and the light half of a `light-dark()` pair.
 */
function plainColor(value: string, paint: ChartPaint): string {
  if (value.toLowerCase() === "currentcolor") return paint.textBody;
  if (value === "var(--plot-background)") return paint.surface;
  const pair = /^light-dark\(\s*([^,]+?)\s*,/.exec(value);
  return pair?.[1] ?? value;
}

/** Text as a group of glyph outlines, one path per run, with the text's own paint and transform. */
function outlineText(
  text: Element,
  fonts: PictureFonts,
  font: ChartFont,
  document: Document,
): Element {
  const group = document.createElementNS(svgNamespace, "g");
  for (const { name, value } of [...text.attributes])
    if (!textOnly.test(name)) group.setAttribute(name, value);
  for (const run of textRuns(text, font, fonts.measure)) {
    const middle = run.baseline - ((font.ascent - font.descent) / 2) * run.font.size;
    const d = fonts.outline(run.text, run.font, run.left, middle);
    if (!d) continue;
    const path = document.createElementNS(svgNamespace, "path");
    path.setAttribute("d", d);
    group.append(path);
  }
  return group;
}

/** The legend's categories, each a swatch and its name, in rows as wide as the chart. */
function categoriesOf(
  entries: Extract<ChartLegend, { kind: "categories" }>["entries"],
  width: number,
  fonts: PictureFonts,
  font: ChartFont,
  paint: ChartPaint,
  document: Document,
): { group: Element; height: number } {
  const { swatch } = legend;
  const group = document.createElementNS(svgNamespace, "g");
  const spec = { family: font.family, ...legend.font };
  let [x, y] = [0, legend.marginTop];
  for (const entry of entries) {
    const words = fonts.measure(entry.value, spec);
    const button = legend.padX * 2 + swatch.width + legend.gap + words;
    if (x > 0 && x + button > width) [x, y] = [0, y + legend.height + legend.gap];
    const middle = y + legend.height / 2;
    const rect = document.createElementNS(svgNamespace, "rect");
    set(rect, {
      x: x + legend.padX,
      y: middle - swatch.height / 2,
      width: swatch.width,
      height: swatch.height,
      rx: swatch.radius,
      fill: entry.color,
    });
    const name = document.createElementNS(svgNamespace, "path");
    set(name, {
      d: fonts.outline(entry.value, spec, x + legend.padX + swatch.width + legend.gap, middle),
      fill: paint.textMuted,
    });
    group.append(rect, name);
    x += button + legend.gap;
  }
  return { group, height: y + legend.height };
}

/** The legend's ramp: the lowest amount, a bar of the ramp's colors, and the highest amount. */
function rampOf(
  low: number,
  high: number,
  fonts: PictureFonts,
  font: ChartFont,
  paint: ChartPaint,
  document: Document,
): { group: Element; height: number } {
  const { ramp, swatch } = legend;
  const group = document.createElementNS(svgNamespace, "g");
  const spec = { family: font.family, size: font.size, weight: ramp.weight, tabular: true };
  const middle = legend.marginTop + legend.height / 2;
  const [first, last] = [amountFormat.format(low), amountFormat.format(high)];
  const start = fonts.measure(first, spec) + ramp.gap;
  const gradient = document.createElementNS(svgNamespace, "linearGradient");
  gradient.setAttribute("id", "legend-ramp");
  for (let i = 0; i <= ramp.stops; i++) {
    const stop = document.createElementNS(svgNamespace, "stop");
    set(stop, { offset: i / ramp.stops, "stop-color": paint.ramp(i / ramp.stops) });
    gradient.append(stop);
  }
  const bar = document.createElementNS(svgNamespace, "rect");
  set(bar, {
    x: start,
    y: middle - swatch.height / 2,
    width: ramp.width,
    height: swatch.height,
    rx: swatch.radius,
    fill: "url(#legend-ramp)",
  });
  const numbers = document.createElementNS(svgNamespace, "path");
  set(numbers, {
    d:
      fonts.outline(first, spec, 0, middle) +
      fonts.outline(last, spec, start + ramp.width + ramp.gap, middle),
    fill: paint.textMuted,
  });
  group.append(gradient, bar, numbers);
  return { group, height: legend.marginTop + legend.height };
}

/** A chart that Plot drew, with its legend. */
export type DrawnChart = ChartDrawing & Required<Pick<ChartDrawing, "svg">>;

/**
 * Draw a chart as the web app shows it in the given paint: the drawing with its text as outlines
 * and the legend under it. The drawing is copied, so it can be drawn again.
 */
export function chartPictureOf(
  drawing: DrawnChart,
  fonts: PictureFonts,
  font: ChartFont,
  paint: ChartPaint,
): Picture {
  const document = drawing.svg.ownerDocument;
  const chart = drawing.svg.cloneNode(true) as SVGSVGElement;
  for (const text of [...chart.querySelectorAll("text")])
    text.replaceWith(outlineText(text, fonts, font, document));
  for (const element of [chart, ...chart.querySelectorAll("*")]) {
    element.removeAttribute("style");
    element.removeAttribute("class");
    for (const name of ["fill", "stroke"]) {
      const value = element.getAttribute(name);
      if (value) element.setAttribute(name, plainColor(value, paint));
    }
  }
  const width = Number(chart.getAttribute("width"));
  const height = Number(chart.getAttribute("height"));
  const key =
    drawing.legend?.kind === "categories"
      ? categoriesOf(drawing.legend.entries, width, fonts, font, paint, document)
      : drawing.legend?.kind === "ramp"
        ? rampOf(drawing.legend.low, drawing.legend.high, fonts, font, paint, document)
        : undefined;
  const total = height + (key?.height ?? 0);
  const picture = document.createElementNS(svgNamespace, "svg");
  set(picture, { xmlns: svgNamespace, width, height: total, viewBox: `0 0 ${width} ${total}` });
  const background = document.createElementNS(svgNamespace, "rect");
  set(background, { width, height: total, fill: paint.surface });
  picture.append(background, chart);
  if (key) {
    key.group.setAttribute("transform", `translate(0,${height})`);
    picture.append(key.group);
  }
  return { svg: picture.outerHTML, width, height: total };
}
