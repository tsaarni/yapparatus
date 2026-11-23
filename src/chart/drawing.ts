/**
 * Drawing a chart with Plot, the same in a browser and on the server: twice, with margins, height,
 * and colors from the first drawing, painted, and the problems the drawing shows.
 */
import { categoryCount, firstUseOrder, tooManyCategories } from "../figure/categories.ts";
import type { Measure } from "../figure/font.ts";
import { bandHeight, figureOptions, widthHeight } from "./figure.ts";
import { isWarningSign, labelsOf } from "./labels.ts";
import { type ChartLegend, repeatsAxis } from "./legend.ts";
import { fitMargins, type Margins, marginsOf, type PlotDrawing } from "./margins.ts";
import { overlaps } from "./overlaps.ts";
import { type ChartPaint, paintDrawing } from "./paint.ts";
import {
  type ChartProblem,
  type ChartSpec,
  type PlotLibrary,
  type Row,
  thrownProblem,
} from "./spec.ts";
import type { ChartFont } from "./text-box.ts";

/** What to draw and how: the marks of `plot`, the rows, the width, and the look. */
export interface ChartInput {
  Plot: PlotLibrary;
  spec: ChartSpec;
  rows: Row[];
  width: number;
  /** The document Plot makes its elements with: the page's, or one without a browser. */
  document: Document;
  font: ChartFont;
  measure: Measure;
  paint: ChartPaint;
  /** Prefix of the ids the drawing defines, unique on the page. */
  id: string;
}

/** A drawing and its legend, or none when Plot threw, with the problems found while drawing. */
export interface ChartDrawing {
  svg?: SVGSVGElement;
  legend?: ChartLegend;
  problems: ChartProblem[];
}

/** Run a draw and collect what Plot writes to `console.warn` meanwhile. */
function withWarnings<T>(draw: () => T): { value: T; warnings: string[] } {
  const warn = console.warn;
  const warnings: string[] = [];
  console.warn = (...args: unknown[]) => warnings.push(args.map(String).join(" "));
  try {
    return { value: draw(), warnings };
  } finally {
    console.warn = warn;
  }
}

/** Plot's warning as a problem, with what the author can do. */
function warningProblem(warning: string): ChartProblem {
  const text = warning.replace(/^Warning:\s*/, "");
  const dates = /data associated with the (\w+) scale are dates/.exec(text);
  const [rect, bar] =
    dates?.[1] === "y" ? ["Plot.rectX", "Plot.barX"] : ["Plot.rectY", "Plot.barY"];
  const advice = dates
    ? ` For bars on dates, use ${rect} with interval: "day" (or "week", "month") in place of ${bar}, and ${dates[1]}: { type: "utc" }.`
    : "";
  return {
    code: "CHART_WARNING",
    subject: text.split(".")[0] ?? text,
    message: `Plot warns: ${text}${advice}`,
  };
}

/** More categories than colors, as a problem: the categories after the colors are muted. */
function categoryProblem(domain: unknown[]): ChartProblem[] {
  if (domain.length <= categoryCount) return [];
  const advice = "Give fill or stroke a column with fewer categories, or split the chart with fx.";
  return [{ code: "TOO_MANY_CATEGORIES", message: tooManyCategories(domain, advice) }];
}

/** A category value as the legend names it. */
const valueText = (value: unknown) =>
  value instanceof Date ? value.toISOString().slice(0, 10) : String(value);

/**
 * Draw twice: the first drawing's values, scales, and labels set the second's colors, height, and
 * margins, and it is painted. Overlaps, extra categories, and Plot's warnings are problems.
 */
export function drawChart(input: ChartInput): ChartDrawing {
  const { Plot, spec, rows, width, document, font, measure, paint } = input;
  const options = (color: object, height: number, first?: PlotDrawing, margins?: Margins) =>
    ({
      ...spec,
      ...figureOptions(spec, { width, height }, first),
      width,
      height,
      document,
      style: { fontFamily: font.family, fontSize: `${font.size}px` },
      color,
      ...(margins && {
        marginTop: margins.top,
        marginRight: margins.right,
        marginBottom: margins.bottom,
        marginLeft: margins.left,
      }),
    }) as Parameters<PlotLibrary["plot"]>[0];
  try {
    const categorical = { type: "categorical", range: paint.categories };
    const first = withWarnings(
      () => Plot.plot(options(categorical, widthHeight(width))) as PlotDrawing,
    ).value;
    const values = [...(first.scale("color")?.domain ?? [])];
    const amounts = values.length > 0 && values.every((v) => typeof v === "number");
    const domain = amounts
      ? []
      : firstUseOrder(
          values,
          rows.flatMap((row) => Object.values(row)),
        );
    const range = domain.map((_, i) => paint.categories[i] ?? paint.textMuted);
    const rampPositions = new Map<string, number>();
    const ramp = (t: number) => {
      const color = paint.ramp(t);
      rampPositions.set(color, t);
      return color;
    };
    const color = amounts
      ? { type: "linear", interpolate: ramp }
      : domain.length
        ? { type: "categorical", domain, range }
        : categorical;
    const margins = fitMargins(first, labelsOf(first, font, measure));
    const height = bandHeight(first, margins ?? marginsOf(first)) ?? widthHeight(width);
    const { value: svg, warnings } = withWarnings(
      () => Plot.plot(options(color, height, first, margins)) as PlotDrawing,
    );
    for (const text of svg.querySelectorAll("text")) if (isWarningSign(text)) text.remove();
    paintDrawing(svg, { paint, id: input.id, rampPositions });
    const legend: ChartLegend | undefined = repeatsAxis(spec, svg)
      ? undefined
      : amounts
        ? { kind: "ramp", low: Math.min(...values), high: Math.max(...values) }
        : domain.length
          ? {
              kind: "categories",
              entries: domain.map((value, i) => ({
                value: valueText(value),
                color: range[i] as string,
              })),
            }
          : undefined;
    const problems = [
      ...categoryProblem(domain),
      ...overlaps(labelsOf(svg, font, measure)),
      ...[...new Set(warnings)].map(warningProblem),
    ];
    return { svg, ...(legend && { legend }), problems };
  } catch (error) {
    return { problems: [thrownProblem(error)] };
  }
}
