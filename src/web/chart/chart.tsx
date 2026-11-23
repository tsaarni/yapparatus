/** The Chart component, which draws a figure with Observable Plot from data the page names. */

import * as stylex from "@stylexjs/stylex";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { type ChartDrawing, drawChart } from "../../chart/drawing.ts";
import {
  type ChartProblem,
  type PlotFunction,
  type PlotLibrary,
  runPlot,
} from "../../chart/spec.ts";
import { type ChartData, rowObjects } from "../../chart/table.ts";
import { diagnosticCodes } from "../../document/diagnostic.ts";
import { FigureFrame } from "../components/figure.tsx";
import { Diagnostics } from "../components/figure-diagnostics.tsx";
import { Button } from "../controls/button.tsx";
import { useChartReport } from "../live/reporters.ts";
import { styled } from "../style/styled.ts";
import { fontSize, fontWeight, radius, sizes, space, theme } from "../style/theme.stylex.ts";
import { useFontsReady } from "./fonts-ready.ts";
import { chartFont, measureText } from "./text-measure.ts";

/** The props an author writes on a chart, and those the compiler adds. */
export interface ChartProps {
  /**
   * Returns the marks:
   * `(Plot, rows) => ({ marks: [Plot.lineY(rows, { x: "Month", y: "Sales" })] })`.
   */
  plot: PlotFunction;
  /** The data inside the chart or in the table it names, added by the compiler, never by hand. */
  data?: ChartData;
  /** The table, "#requests", or file, "/-/files/bench/results.csv", to read the data from. */
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
 * The chart's data: data in the page at once, and a file's when the chart nears the screen,
 * before printing, or while editing once the browser is idle, so every chart gets checked.
 */
function useData(
  data: ChartData | undefined,
  load: ChartProps["load"],
  host: { current: HTMLElement | null },
) {
  const [loaded, setLoaded] = useState<{ data?: ChartData; error?: string }>({});
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
      { root: element.closest("[data-scroll-root]"), rootMargin: "800px 0px" },
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
type Drawn = Partial<ChartDrawing> & { problems: ChartProblem[] };

const lastValid = new Map<string, Drawn>();
const swatches = () => [s.swatch1, s.swatch2, s.swatch3, s.swatch4];

/**
 * A chart drawn by Observable Plot from data inside it or named by `from`. The author writes the
 * marks; the chart sets size, fonts, margins, and colors, and reports problems it cannot fix.
 */
export function Chart({ plot, data: written, load, id, caption, description }: ChartProps) {
  const Plot = usePlotLibrary();
  const fonts = useFontsReady();
  const marker = useId();
  const [host, width] = useWidth();
  const { data, error } = useData(written, load, host);
  const [preview, setPreview] = useState<string>();
  const source = plot.toString();
  const rows = useMemo(() => (data ? rowObjects(data) : []), [data]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: The source text stands for `plot`.
  const result = useMemo(
    () => (Plot && fonts && width && data ? draw(Plot, plot, rows, width) : undefined),
    [Plot, fonts, width, source, data, rows],
  );
  const key = id ?? caption;
  if (result?.svg && key) lastValid.set(key, result);
  const fallback = dev && result && !result.svg && key ? lastValid.get(key) : undefined;
  const drawn = result?.svg ? result : fallback;
  const missing = !written && !load;
  const unloaded: ChartProblem[] = missing
    ? [{ code: "CHART_DATA", message: "The chart has no data." }]
    : error
      ? [{ code: "CHART_DATA", message: `The data could not load: ${error}` }]
      : [];
  const problems = unloaded.length ? unloaded : (result?.problems ?? []);

  const canvas = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    element.replaceChildren(...(drawn?.svg ? [drawn.svg] : []));
  }, [drawn]);
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

  useChartReport(
    marker,
    key ?? marker,
    error ? unloaded.map((p) => ({ ...p, ...(id ? { target: id } : {}) })) : undefined,
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
 * Run `plot` and draw its marks at the chart's width, in the theme's type and colors. The page
 * compiler reports the problems; the chart shows them while editing.
 */
function draw(
  Plot: PlotLibrary,
  plot: PlotFunction,
  rows: ReturnType<typeof rowObjects>,
  width: number,
): Drawn {
  const { spec, problems: called } = runPlot(Plot, plot, rows);
  if (!spec || called.some((p) => diagnosticCodes[p.code].severity === "error"))
    return { problems: called };
  const drawn = drawChart({
    Plot,
    spec,
    rows,
    width,
    document,
    font: chartFont(theme.sans, Number.parseFloat(fontSize.xs), Number(fontWeight.regular)),
    measure: measureText,
    colors: { categories: categoryColors, muted: theme.textMuted, text: theme.textBody },
  });
  drawn.svg?.style.setProperty("--plot-background", theme.surfaceRaised);
  return { ...drawn, problems: [...called, ...drawn.problems] };
}

const s = stylex.create({
  /** A chart has no natural size: it takes the wide track, and shrinks with the reading column. */
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
