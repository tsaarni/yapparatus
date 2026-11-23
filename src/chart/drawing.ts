/**
 * Drawing a chart with Plot, the same in a browser and on the server: twice, with margins and
 * category colors from the first drawing, and the problems the drawing shows.
 */
import type { Measure } from "../diagram/metrics.ts";
import { isWarningSign, labelsOf } from "./labels.ts";
import { fitMargins, type Margins, type PlotDrawing } from "./margins.ts";
import { overlaps } from "./overlaps.ts";
import {
  type ChartProblem,
  type ChartSpec,
  firstUseOrder,
  type PlotLibrary,
  type Row,
  thrownProblem,
} from "./spec.ts";
import type { ChartFont } from "./text-box.ts";

/** The colors a chart draws with: one per category in order, then muted, and the text color. */
export interface ChartColors {
  categories: readonly string[];
  muted: string;
  text: string;
}

/** A category of the legend and its color. */
export interface LegendEntry {
  value: string;
  color: string;
}

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
  colors: ChartColors;
}

/** A drawing and its legend, or none when Plot threw, with the problems found while drawing. */
export interface ChartDrawing {
  svg?: SVGSVGElement;
  legend: LegendEntry[];
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
function categoryProblem(domain: unknown[], colors: ChartColors): ChartProblem[] {
  const count = colors.categories.length;
  if (domain.length <= count) return [];
  return [
    {
      code: "TOO_MANY_CATEGORIES",
      message: `The colors name ${domain.length} categories: ${domain.slice(0, 8).join(", ")}${domain.length > 8 ? ", …" : ""}. A chart has ${count} category colors, so the rest are drawn muted. Give fill or stroke a column with fewer categories, or split the chart with fx.`,
    },
  ];
}

/**
 * Draw twice: the first drawing's categories and label boxes set the colors and margins of the
 * second. Overlaps, extra categories, and Plot's warnings are problems; Plot's sign goes.
 */
export function drawChart(input: ChartInput): ChartDrawing {
  const { Plot, spec, rows, width, document, font, measure, colors } = input;
  const options = (color: object, margins?: Margins) =>
    ({
      ...spec,
      width,
      document,
      style: { fontFamily: font.family, fontSize: `${font.size}px`, color: colors.text },
      color: { type: "categorical", ...color },
      ...(margins && {
        marginTop: margins.top,
        marginRight: margins.right,
        marginBottom: margins.bottom,
        marginLeft: margins.left,
      }),
    }) as Parameters<PlotLibrary["plot"]>[0];
  try {
    const first = withWarnings(
      () => Plot.plot(options({ range: colors.categories })) as PlotDrawing,
    ).value;
    const domain = firstUseOrder([...(first.scale("color")?.domain ?? [])], rows);
    const range = domain.map((_, i) => colors.categories[i] ?? colors.muted);
    const margins = fitMargins(first, labelsOf(first, font, measure));
    const { value: svg, warnings } = withWarnings(
      () =>
        Plot.plot(
          options(domain.length ? { domain, range } : { range: colors.categories }, margins),
        ) as SVGSVGElement,
    );
    for (const text of svg.querySelectorAll("text")) if (isWarningSign(text)) text.remove();
    const legend = domain.map((value, i) => ({
      value: value instanceof Date ? value.toISOString().slice(0, 10) : String(value),
      color: range[i] as string,
    }));
    const problems = [
      ...categoryProblem(domain, colors),
      ...overlaps(labelsOf(svg, font, measure)),
      ...[...new Set(warnings)].map(warningProblem),
    ];
    return { svg, legend, problems };
  } catch (error) {
    return { legend: [], problems: [thrownProblem(error)] };
  }
}
