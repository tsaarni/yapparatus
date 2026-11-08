/**
 * What Yapparatus adds around Observable Plot. The author writes the marks; Yapparatus owns the
 * size, fonts, colors, and margins, and checks what the marks name.
 */
import type * as PlotModule from "@observablehq/plot";

export type PlotLibrary = typeof PlotModule;
export type Row = Record<string, number | string | Date | null>;

/** What `plot` returns: the marks, and the options of the position scales. */
export interface ChartSpec {
  marks: PlotModule.Markish[];
  x?: PlotModule.ScaleOptions;
  y?: PlotModule.ScaleOptions;
  fx?: PlotModule.ScaleOptions;
  fy?: PlotModule.ScaleOptions;
  r?: PlotModule.ScaleOptions;
}

export type PlotFunction = (Plot: PlotLibrary, rows: Row[]) => ChartSpec;

export interface ChartProblem {
  code: string;
  severity: "error" | "warning";
  message: string;
}

/** The options `plot` may return. Everything else about the figure is Yapparatus's. */
export const specOptions = ["marks", "x", "y", "fx", "fy", "r"] as const;

/** Mark options that name a column when they are text. */
const fieldOptions = [
  "x",
  "y",
  "x1",
  "x2",
  "y1",
  "y2",
  "z",
  "fill",
  "stroke",
  "r",
  "text",
  "title",
  "fx",
  "fy",
  "href",
  "length",
  "rotate",
  "fillOpacity",
  "strokeOpacity",
  "opacity",
] as const;
const colorOptions = new Set(["fill", "stroke"]);
/** Constant colors that are no color of their own. */
const neutral = new Set(["none", "currentcolor", "inherit"]);
/** Plot functions that would draw outside the figure Yapparatus makes. */
const outside = new Set(["plot", "legend"]);

/** Is this text a CSS color, as Plot would read a constant `fill` or `stroke`? */
function isColor(value: string): boolean {
  if (typeof CSS !== "undefined" && CSS.supports) return CSS.supports("color", value);
  return /^(#[0-9a-f]{3,8}|(rgb|hsl|hwb|lab|lch|oklab|oklch|color)a?\(.*\)|[a-z]+)$/i.test(value);
}

const isPlain = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;

/** The fields of an array of rows: the keys of the first rows, or nothing to check against. */
function fieldsOf(data: unknown): Set<string> | undefined {
  if (!Array.isArray(data) || !data.length || !data.slice(0, 20).every(isPlain)) return;
  return new Set(data.slice(0, 20).flatMap((row) => Object.keys(row)));
}

const list = (names: Iterable<string>) => [...names].map((n) => `"${n}"`).join(", ");

/**
 * The Plot library as `plot` sees it. Each function checks the options it is given: a text
 * value of a field option must name a column of the mark's data, and `fill` and `stroke`
 * take a column, never a literal color, because the theme picks colors.
 */
export function chartLibrary(Plot: PlotLibrary, problems: ChartProblem[]): PlotLibrary {
  const library: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(Plot)) {
    if (typeof value !== "function" || /^[A-Z]/.test(name)) {
      library[name] = value;
      continue;
    }
    library[name] = (...args: unknown[]) => {
      if (outside.has(name))
        problems.push({
          code: "CHART_OPTION",
          severity: "error",
          message: `plot calls Plot.${name}. Return { marks: [...] } instead: the chart draws the plot, its legend, and its frame.`,
        });
      const data = Array.isArray(args[0]) ? args[0] : undefined;
      const options = args.findLast(isPlain);
      if (options) checkOptions(name, options, fieldsOf(data), problems);
      return (value as (...a: unknown[]) => unknown)(...args);
    };
  }
  return library as PlotLibrary;
}

function checkOptions(
  name: string,
  options: Record<string, unknown>,
  fields: Set<string> | undefined,
  problems: ChartProblem[],
) {
  for (const key of fieldOptions) {
    const value = options[key];
    if (typeof value !== "string" || fields?.has(value)) continue;
    if (colorOptions.has(key) && isColor(value)) {
      // A transform passes its options on to the mark, which would report them again.
      const reported = problems.some((p) => p.message.includes(`sets ${key}: "${value}"`));
      if (!neutral.has(value.toLowerCase()) && !reported)
        problems.push({
          code: "CHART_COLOR",
          severity: "error",
          message: `Plot.${name} sets ${key}: "${value}". The theme picks colors: set ${key} to a column of categories${fields ? `, one of ${list(fields)},` : ""} and each category gets its own color, or leave it out for the text color.`,
        });
      continue;
    }
    if (fields)
      problems.push({
        code: "CHART_FIELD",
        severity: "error",
        message: `Plot.${name} sets ${key}: "${value}", which is no column of its data. The columns are ${list(fields)}.`,
      });
  }
}

/** Problems with what `plot` returned: anything but marks and position scales is the chart's own. */
export function checkSpec(spec: unknown): ChartProblem[] {
  if (!isPlain(spec) || !Array.isArray(spec.marks))
    return [
      {
        code: "CHART_OPTION",
        severity: "error",
        message: "plot returns { marks: [...] }, with the marks in an array.",
      },
    ];
  const extra = Object.keys(spec).filter((k) => !(specOptions as readonly string[]).includes(k));
  if (!extra.length) return [];
  return [
    {
      code: "CHART_OPTION",
      severity: "error",
      message: `plot returns ${list(extra)}. It may return ${list(specOptions)}: the chart sets its size, margins, fonts, colors, and legend itself.`,
    },
  ];
}

/**
 * Category values in the order the rows first use them, as diagrams give categories their
 * colors. Values no row holds, such as a transform's output, keep their place after them.
 */
export function firstUseOrder(domain: unknown[], rows: Row[]): unknown[] {
  const first = new Map<string, number>();
  rows.forEach((row, i) => {
    for (const value of Object.values(row)) {
      const key = String(value);
      if (!first.has(key)) first.set(key, i);
    }
  });
  const at = (value: unknown) => first.get(String(value)) ?? Number.POSITIVE_INFINITY;
  return domain
    .map((value, i) => ({ value, i }))
    .sort((a, b) => at(a.value) - at(b.value) || a.i - b.i)
    .map(({ value }) => value);
}
