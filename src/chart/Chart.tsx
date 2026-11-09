import * as stylex from "@stylexjs/stylex";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Diagnostics, useFontsReady } from "../diagram/Diagram.tsx";
import { diagnosticCodes } from "../protocol.ts";
import { FigureFrame } from "../reader/components.tsx";
import { useDiagramReport } from "../reader/diagnostics.tsx";
import { fontSize, radius, sizes, space, theme } from "../reader/theme.stylex.ts";
import { Button, styled } from "../reader/ui.tsx";
import { type ChartData, rowObjects } from "./data.ts";
import {
  type ChartProblem,
  type ChartSpec,
  chartLibrary,
  checkSpec,
  firstUseOrder,
  type PlotFunction,
  type PlotLibrary,
} from "./plot.ts";

export interface ChartProps {
  /** Returns the marks: `(Plot, rows) => ({ marks: [Plot.lineY(rows, { x: "Month", y: "Sales" })] })`. */
  plot: PlotFunction;
  /** The data written inside the chart or in the table it names, read by the compiler. Never written by hand. */
  data?: ChartData;
  /** A table on the page, "#requests", or a file, "/-/files/bench/results.csv", to read the data from. */
  from?: string;
  /** Loads a file's data, from a module the compiler makes. Never written by hand. */
  load?: () => Promise<{ default: ChartData }>;
  /** Figure id for references and links. With a caption, the chart is numbered. */
  id?: string;
  caption?: string;
  description?: string;
}

const dev = import.meta.env.DEV;
/** The categories' colors, in order of first use. */
const categoryColors = [theme.category1, theme.category2, theme.category3, theme.category4];
/** Room kept between a label and the figure's edge, or another label. */
const labelClearance = 4;

let library: Promise<PlotLibrary> | undefined;
/** Plot loads with the first chart, so documents without charts never load it. */
function usePlotLibrary() {
  const [plot, setPlot] = useState<PlotLibrary>();
  useEffect(() => {
    let live = true;
    library ??= import("@observablehq/plot");
    library.then((loaded) => live && setPlot(loaded));
    return () => {
      live = false;
    };
  }, []);
  return plot;
}

/** The width the chart has, which follows the reading layout. */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const next = Math.floor(entry?.contentRect.width ?? 0);
      if (next) setWidth(next);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/**
 * The chart's data: data written in the page at once, and a file's when the chart comes near
 * the screen, so a long page with large files opens without loading them. Printing loads them
 * all. While editing, a file's data also loads when the browser is idle, so every chart gets
 * checked.
 */
function useData(
  data: ChartData | undefined,
  load: ChartProps["load"],
  host: { current: HTMLElement | null },
) {
  const [loaded, setLoaded] = useState<{ data?: ChartData; error?: string }>({});
  // The module id carries the file's version: a new one loads again.
  const version = load?.toString();
  // biome-ignore lint/correctness/useExhaustiveDependencies: The version stands for `load`.
  useEffect(() => {
    const element = host.current;
    if (data || !load || !element) return;
    let started = false;
    let live = true;
    const start = () => {
      if (started) return;
      started = true;
      load().then(
        (module) => live && setLoaded({ data: module.default }),
        (error) => live && setLoaded({ error: String(error?.message ?? error) }),
      );
    };
    const observer = new IntersectionObserver(
      (entries) => entries.some((e) => e.isIntersecting) && start(),
      { rootMargin: "800px 0px" },
    );
    observer.observe(element);
    window.addEventListener("beforeprint", start);
    const idle = dev ? window.setTimeout(start, 1500) : undefined;
    return () => {
      live = false;
      observer.disconnect();
      window.removeEventListener("beforeprint", start);
      window.clearTimeout(idle);
    };
  }, [data, version, host]);
  return data ? { data } : loaded;
}

/** A drawing, or only the problems that kept it from being drawn. */
interface Drawn {
  svg?: SVGSVGElement;
  legend?: { value: string; color: string }[];
  problems: ChartProblem[];
}

const lastValid = new Map<string, Drawn>();
/** What Plot draws: an SVG element that also answers for its scales. */
type PlotDrawing = SVGSVGElement & {
  scale: (name: string) => { domain?: unknown[]; range?: number[] } | undefined;
};
const swatches = () => [s.swatch1, s.swatch2, s.swatch3, s.swatch4];

/**
 * A chart drawn by Observable Plot from data the page names: a block of data inside the
 * chart, or a file with `from`. The author writes the marks; the chart sets its
 * size, fonts, margins, and colors, and reports problems instead of repairing them.
 */
export function Chart({ plot, data: written, load, id, caption, description }: ChartProps) {
  const Plot = usePlotLibrary();
  const fonts = useFontsReady();
  const marker = useId();
  const [host, width] = useWidth();
  const { data, error } = useData(written, load, host);
  const [preview, setPreview] = useState<string>();
  // `plot` is a new function on every render, but a pure one: its source text identifies it.
  const source = plot.toString();
  const rows = useMemo(() => (data ? rowObjects(data) : []), [data]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: The source text stands for `plot`.
  const result = useMemo(
    () => (Plot && fonts && width && data ? draw(Plot, plot, rows, width) : undefined),
    [Plot, fonts, width, source, data, rows],
  );
  const key = id ?? caption;
  // While editing, keep showing the last valid drawing above the errors.
  if (result?.svg && key) lastValid.set(key, result);
  const fallback = dev && result && !result.svg && key ? lastValid.get(key) : undefined;
  const drawn = result?.svg ? result : fallback;
  const missing = !written && !load;
  const problems: ChartProblem[] = missing
    ? [{ code: "CHART_DATA", message: "The chart has no data." }]
    : error
      ? [{ code: "CHART_DATA", message: `The data could not load: ${error}` }]
      : (result?.problems ?? []);

  // The drawing is a DOM element Plot made; it replaces the last one in place.
  const canvas = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    element.replaceChildren(...(drawn?.svg ? [drawn.svg] : []));
  }, [drawn]);
  // Pointing at a legend entry fades the marks of the other categories.
  useEffect(() => {
    if (!drawn?.svg) return;
    for (const mark of drawn.svg.querySelectorAll<SVGElement>("[fill], [stroke]")) {
      if (mark.closest("[aria-label$=axis], [aria-label$='tick label'], [aria-label$=label]"))
        continue;
      const colors = [mark.getAttribute("fill"), mark.getAttribute("stroke")];
      const other =
        preview && categoryColors.some((c) => colors.includes(c)) && !colors.includes(preview);
      mark.style.opacity = other ? "0.15" : "";
    }
  }, [drawn, preview]);

  useDiagramReport(
    marker,
    key ?? marker,
    result || missing || error
      ? problems.map((p) => ({ ...p, ...(id ? { target: id } : {}) }))
      : undefined,
  );

  const label = caption ?? "Chart";
  const body = (
    <div ref={host} data-diagram={marker} {...styled("chart", s.chart)}>
      <div
        ref={canvas}
        role="img"
        aria-label={description ?? label}
        {...stylex.props(s.canvas, !!fallback && s.stale, !drawn && s.pending)}
      />
      {drawn?.legend && drawn.legend.length > 0 && (
        <ul aria-label="Legend" {...stylex.props(s.legend)}>
          {drawn.legend.map((entry, i) => (
            <li key={entry.value}>
              <Button
                variant="ghost"
                size="small"
                title="Highlight this category"
                onMouseEnter={() => setPreview(entry.color)}
                onMouseLeave={() => setPreview(undefined)}
                onFocus={() => setPreview(entry.color)}
                onBlur={() => setPreview(undefined)}
              >
                <span {...stylex.props(s.swatch, swatches()[i] ?? s.swatchMuted)} />
                {entry.value}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {dev && problems.length > 0 && <Diagnostics items={problems} of="chart" />}
    </div>
  );
  if (!id && !caption) return body;
  return (
    <FigureFrame
      {...(id ? { id } : {})}
      {...(caption ? { caption } : {})}
      {...(description ? { description } : {})}
    >
      {body}
    </FigureFrame>
  );
}
Chart.breakout = true;

/**
 * Draw the chart twice: once to measure, and once with what the measurement found. The first
 * drawing gives the categories, which take their colors in order of first use, and the labels'
 * extent, which sets the margins so no label is cut off. Labels that overlap are reported.
 */
function draw(
  Plot: PlotLibrary,
  plot: PlotFunction,
  rows: ReturnType<typeof rowObjects>,
  width: number,
): Drawn {
  const problems: ChartProblem[] = [];
  let spec: ChartSpec;
  try {
    spec = plot(chartLibrary(Plot, problems), rows);
  } catch (error) {
    return { problems: [...problems, thrown(error)] };
  }
  problems.push(...checkSpec(spec));
  if (problems.some((p) => diagnosticCodes[p.code].severity === "error")) return { problems };
  const base = {
    ...spec,
    width,
    style: { fontFamily: theme.sans, fontSize: fontSize.xs, color: theme.textBody },
  };
  const options = (color: object, margins?: Margins) => ({
    ...base,
    color: { type: "categorical", ...color },
    ...(margins && {
      marginTop: margins.top,
      marginRight: margins.right,
      marginBottom: margins.bottom,
      marginLeft: margins.left,
    }),
  });
  const measure = document.createElement("div");
  measure.style.cssText = `position:absolute;visibility:hidden;left:-10000px;top:0;width:${width}px`;
  document.body.append(measure);
  try {
    const first = Plot.plot(options({ range: categoryColors }) as Parameters<typeof Plot.plot>[0]);
    measure.append(first);
    const domain = firstUseOrder([...((first as PlotDrawing).scale("color")?.domain ?? [])], rows);
    if (domain.length > categoryColors.length)
      problems.push({
        code: "TOO_MANY_CATEGORIES",
        message: `The colors name ${domain.length} categories: ${domain.slice(0, 8).join(", ")}${domain.length > 8 ? ", …" : ""}. A chart has ${categoryColors.length} category colors, so the rest are drawn muted. Give fill or stroke a column with fewer categories, or split the chart with fx.`,
      });
    const range = domain.map((_, i) => categoryColors[i] ?? theme.textMuted);
    const margins = fitMargins(first as PlotDrawing);
    first.remove();
    const svg = Plot.plot(
      options(domain.length ? { domain, range } : { range: categoryColors }, margins) as Parameters<
        typeof Plot.plot
      >[0],
    ) as SVGSVGElement;
    svg.style.setProperty("--plot-background", theme.surfaceRaised);
    measure.append(svg);
    problems.push(...overlaps(svg));
    svg.remove();
    const legend = domain.map((value, i) => ({
      value: value instanceof Date ? value.toISOString().slice(0, 10) : String(value),
      color: range[i] as string,
    }));
    return { svg, legend, problems };
  } catch (error) {
    return { problems: [...problems, thrown(error)] };
  } finally {
    measure.remove();
  }
}

function thrown(error: unknown): ChartProblem {
  return {
    code: "CHART_FAILED",
    message: error instanceof Error ? error.message : String(error),
  };
}

interface Margins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** The margins Plot chose for a drawing, read from where its outer scales start and end. */
function marginsOf(svg: PlotDrawing): Margins {
  const width = svg.width.baseVal.value;
  const height = svg.height.baseVal.value;
  const extent = (name: string) => {
    const range = svg.scale(name)?.range;
    return range?.length ? [Math.min(...range), Math.max(...range)] : undefined;
  };
  const [left = 0, right = width] = extent("fx") ?? extent("x") ?? [];
  const [top = 0, bottom = height] = extent("fy") ?? extent("y") ?? [];
  return { top, right: width - right, bottom: height - bottom, left };
}

const rectOf = (element: Element) => element.getBoundingClientRect();
/**
 * Margins wide enough for every label, from a first drawing: grown by how far labels reach
 * past the edge, and on an axis label's side by how far it comes closer to the tick labels
 * than the clearance, since Plot sets an axis label into the margin. Undefined when Plot's
 * own margins fit.
 */
function fitMargins(svg: PlotDrawing): Margins | undefined {
  const frame = rectOf(svg);
  const over = { top: 0, right: 0, bottom: 0, left: 0 };
  for (const text of svg.querySelectorAll("text")) {
    const r = rectOf(text);
    if (!r.width) continue;
    over.left = Math.max(over.left, frame.left - r.left);
    over.right = Math.max(over.right, r.right - frame.right);
    over.top = Math.max(over.top, frame.top - r.top);
    over.bottom = Math.max(over.bottom, r.bottom - frame.bottom);
  }
  // An axis label needs a clear band beyond its tick labels, even where it falls between two.
  for (const axis of ["x", "y", "fx", "fy"]) {
    const label = svg.querySelector(`[aria-label="${axis}-axis label"] text`);
    const ticks = [...svg.querySelectorAll(`[aria-label="${axis}-axis tick label"] text`)].map(
      rectOf,
    );
    if (!label || !ticks.length) continue;
    const at = rectOf(label);
    const top = Math.min(...ticks.map((r) => r.top));
    const bottom = Math.max(...ticks.map((r) => r.bottom));
    const left = Math.min(...ticks.map((r) => r.left));
    const right = Math.max(...ticks.map((r) => r.right));
    const middle = at.top + at.height / 2;
    if (middle > bottom) over.bottom = Math.max(over.bottom, bottom + labelClearance - at.top);
    else if (middle < top) over.top = Math.max(over.top, at.bottom + labelClearance - top);
    else if (at.left + at.width / 2 < left)
      over.left = Math.max(over.left, at.right + labelClearance - left);
    else over.right = Math.max(over.right, right + labelClearance - at.left);
  }
  if (Object.values(over).every((n) => n <= 0)) return;
  const base = marginsOf(svg);
  const grow = (side: keyof Margins) =>
    over[side] > 0 ? Math.ceil(base[side] + over[side] + labelClearance) : base[side];
  return { top: grow("top"), right: grow("right"), bottom: grow("bottom"), left: grow("left") };
}

/** Tick labels on one axis that run into each other, which no margin can fix. */
function overlaps(svg: Element): ChartProblem[] {
  const problems: ChartProblem[] = [];
  for (const axis of ["x", "y", "fx", "fy"]) {
    const labels = [...svg.querySelectorAll(`[aria-label="${axis}-axis tick label"] text`)].map(
      (t) => ({ text: t.textContent ?? "", r: t.getBoundingClientRect() }),
    );
    const horizontal = axis.endsWith("x");
    const sorted = labels.sort((a, b) => (horizontal ? a.r.left - b.r.left : a.r.top - b.r.top));
    const clash = sorted.find((a, i) => {
      const b = sorted[i + 1];
      if (!b) return false;
      return horizontal ? a.r.right > b.r.left + 1 : a.r.bottom > b.r.top + 1;
    });
    if (!clash) continue;
    const next = sorted[sorted.indexOf(clash) + 1];
    problems.push({
      code: "CHART_OVERLAP",
      subject: axis,
      message: `The ${axis} tick labels "${clash.text}" and "${next?.text}" overlap. Show fewer ticks with ${axis}: { ticks: 5 }, rotate them with ${axis}: { tickRotate: -30 }, shorten the values, or swap the axes.`,
    });
  }
  return problems;
}

const s = stylex.create({
  // A chart has no natural size: it takes the wide track, and shrinks with the reading column.
  chart: {
    width: `calc(${sizes.textWidth} + ${sizes.breakout} - 2 * ${space.xl} - 2px)`,
    maxWidth: "100%",
  },
  canvas: { minHeight: 120 },
  pending: { minHeight: 400 },
  stale: { opacity: 0.35, filter: "grayscale(1)" },
  legend: {
    display: "flex",
    flexWrap: "wrap",
    gap: space.xs,
    margin: 0,
    marginTop: space.md,
    padding: 0,
    listStyle: "none",
  },
  swatch: {
    display: "inline-block",
    flexShrink: 0,
    width: 14,
    height: 10,
    borderRadius: radius.sm,
  },
  swatch1: { backgroundColor: theme.category1 },
  swatch2: { backgroundColor: theme.category2 },
  swatch3: { backgroundColor: theme.category3 },
  swatch4: { backgroundColor: theme.category4 },
  swatchMuted: { backgroundColor: theme.textMuted },
});
