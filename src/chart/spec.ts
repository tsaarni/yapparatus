/**
 * What Yapparatus adds around Observable Plot. The author writes the marks; Yapparatus owns the
 * size, fonts, colors, and margins, and checks what the marks name.
 */
import type * as PlotModule from "@observablehq/plot";
import type { DiagnosticCode } from "../document/diagnostic.ts";
import { stackProblems } from "./stacking.ts";

/** The Observable Plot module that `plot` receives. */
export type PlotLibrary = typeof PlotModule;
/** A data row as `plot` receives it, keyed by column name. */
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

/** The author's `plot` function: builds marks from the Plot library and the rows. */
export type PlotFunction = (Plot: PlotLibrary, rows: Row[]) => ChartSpec;

/** A problem found in what `plot` calls or returns, reported as a diagnostic. */
export interface ChartProblem {
  code: DiagnosticCode;
  /** What the problem is about, so two problems in one chart stay apart. */
  subject?: string;
  message: string;
}

/** A mark as Plot builds it: its ARIA label, its channels, and its facet fields. */
export interface PlotMark {
  ariaLabel?: string;
  channels: Record<string, { value: unknown } | undefined>;
  fx?: unknown;
  fy?: unknown;
}

/** The marks of a spec, with Plot's composite marks, such as a box, taken apart. */
export function marksOf(spec: ChartSpec): PlotMark[] {
  const flat = (mark: unknown): PlotMark[] =>
    Array.isArray(mark)
      ? mark.flatMap(flat)
      : mark && typeof mark === "object" && "channels" in mark
        ? [mark as PlotMark]
        : [];
  return flat(spec.marks);
}

/** The column a channel reads: its field, or the field a transform of it names. */
export function columnOf(channel: { value: unknown } | undefined): string | undefined {
  const value = channel?.value;
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "label" in value && typeof value.label === "string")
    return value.label;
  return undefined;
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
const neutral = new Set(["none", "currentcolor", "inherit", "transparent"]);
/** Plot functions that would draw outside the figure Yapparatus makes. */
const outside = new Set(["plot", "legend"]);
/** The CSS color keywords, so that a color is told from a column name without a browser. */
const namedColors = new Set(
  (
    "aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue " +
    "blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk " +
    "crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki " +
    "darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen " +
    "darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue " +
    "dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite " +
    "gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki " +
    "lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan " +
    "lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen " +
    "lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen " +
    "magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen " +
    "mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream " +
    "mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid " +
    "palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum " +
    "powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown " +
    "seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen " +
    "steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen"
  ).split(" "),
);

/** Is this text a CSS color, as Plot would read a constant `fill` or `stroke`? */
function isColor(value: string): boolean {
  const text = value.trim().toLowerCase();
  return (
    neutral.has(text) ||
    namedColors.has(text) ||
    /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(text) ||
    /^(rgb|hsl|hwb|lab|lch|oklab|oklch|color)a?\(.*\)$/.test(text)
  );
}

/** A plain object, also one made in another realm, such as the context the compiler runs in. */
function isPlain(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === null || Object.getPrototypeOf(proto) === null;
}

/** The fields of an array of rows: the keys of the first rows, or nothing to check against. */
function fieldsOf(data: unknown): Set<string> | undefined {
  if (!Array.isArray(data) || !data.length || !data.slice(0, 20).every(isPlain)) return;
  return new Set(data.slice(0, 20).flatMap((row) => Object.keys(row)));
}

const list = (names: Iterable<string>) => [...names].map((n) => `"${n}"`).join(", ");

/**
 * The Plot library as `plot` sees it: each function checks that field options name a column
 * of the mark's data, and that `fill` and `stroke` take a column, since the theme picks colors.
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
          subject: `Plot.${name}`,
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

/** Report field options that name no column, and literal `fill` or `stroke` colors. */
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
      const reported = problems.some((p) => p.message.includes(`sets ${key}: "${value}"`));
      if (!neutral.has(value.trim().toLowerCase()) && !reported)
        problems.push({
          code: "CHART_COLOR",
          subject: `Plot.${name} ${key}: ${value}`,
          message: `Plot.${name} sets ${key}: "${value}". The theme picks colors: set ${key} to a column${fields ? `, one of ${list(fields)},` : ""} and each category gets its own color and each amount a shade, or leave it out for the accent color.`,
        });
      continue;
    }
    if (fields)
      problems.push({
        code: "CHART_FIELD",
        subject: `Plot.${name} ${key}: ${value}`,
        message: `Plot.${name} sets ${key}: "${value}", which is no column of its data. The columns are ${list(fields)}.`,
      });
  }
}

/** Problems with what `plot` returned: anything but marks and position scales is the chart's. */
export function checkSpec(spec: unknown): ChartProblem[] {
  if (!isPlain(spec) || !Array.isArray(spec.marks))
    return [
      {
        code: "CHART_OPTION",
        subject: "marks",
        message: "plot returns { marks: [...] }, with the marks in an array.",
      },
    ];
  const extra = Object.keys(spec).filter((k) => !(specOptions as readonly string[]).includes(k));
  if (!extra.length) return [];
  return [
    {
      code: "CHART_OPTION",
      subject: extra.join(", "),
      message: `plot returns ${list(extra)}. It may return ${list(specOptions)}: the chart sets its size, margins, fonts, colors, and legend itself.`,
    },
  ];
}

/** The problem for an error thrown by `plot` or Plot, also one made in another realm. */
export function thrownProblem(error: unknown): ChartProblem {
  const message =
    error && typeof error === "object" && "message" in error
      ? String(error.message)
      : String(error);
  return { code: "CHART_FAILED", message };
}

/**
 * Call `plot` with the checked library and check what it returns. The page compiler runs this
 * to report the problems, and the browser to get the marks it draws.
 */
export function runPlot(
  Plot: PlotLibrary,
  plot: PlotFunction,
  rows: Row[],
): { spec?: ChartSpec; problems: ChartProblem[] } {
  const problems: ChartProblem[] = [];
  let spec: ChartSpec;
  try {
    spec = plot(chartLibrary(Plot, problems), rows);
  } catch (error) {
    return { problems: [...problems, thrownProblem(error)] };
  }
  const shape = checkSpec(spec);
  problems.push(...shape, ...(shape.length ? [] : stackProblems(spec)));
  return { spec, problems };
}
