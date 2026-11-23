/**
 * The figure options Yapparatus gives Plot: quiet axes, a grid on the value axis, an inset for
 * charts of points, and a height that follows the data. The author's scale options win.
 */
import type { Margins, PlotDrawing } from "./margins.ts";
import { type ChartSpec, marksOf } from "./spec.ts";

/** Height of each band of a band y scale, in pixels, as Plot sizes the figure. */
export const bandStep = 30;
/** Smallest height of a chart with a band y scale. */
export const minBandHeight = 120;
/** Height of a chart with a continuous y scale, as a share of its width. */
export const heightRatio = 0.5;
/** Smallest height of a chart with a continuous y scale. */
export const minHeight = 220;
/** Largest height of a chart with a continuous y scale. */
export const maxHeight = 380;
/** Room between tick labels and the plot's frame. */
export const tickPadding = 6;
/** Widest bar on a band x scale: fewer bars get more room around them, not wider bars. */
export const maxBarWidth = 96;
/** Pixels per tick on a continuous y axis: about five ticks on a chart of usual height. */
export const yTickSpacing = 64;
/** Pixels per tick on a continuous x axis, so tick labels keep room between them. */
export const xTickSpacing = 110;
/** Room inside the frame of a chart of points, so dots at the domain's ends are not cut. */
export const pointInset = 6;

/** Marks that draw points and lines, which an inset keeps inside the frame. */
const pointMarks = new Set([
  "dot",
  "line",
  "text",
  "rule",
  "link",
  "tick",
  "arrow",
  "vector",
  "linear-regression",
]);

/** Is this a scale of categories, whose values each get a band? */
const isBand = (type: string | undefined) => type === "band" || type === "point";

/** A scale's type in a drawing. */
const typeOf = (svg: PlotDrawing | undefined, name: string) =>
  (svg?.scale(name) as { type?: string } | undefined)?.type;

/**
 * The options of the scales, and with a first drawing the inset, bars no wider than `maxBarWidth`,
 * ticks spaced for the size, and a grid on the value axis: y when continuous, else x.
 */
export function figureOptions(
  spec: ChartSpec,
  size: { width: number; height: number },
  first?: PlotDrawing,
) {
  const axis = { tickSize: 0, tickPadding, labelArrow: "none" } as const;
  const [x, y] = [typeOf(first, "x"), typeOf(first, "y")];
  const gridY = !!first && y !== undefined && !isBand(y);
  const gridX = isBand(y) && x !== undefined && !isBand(x);
  const marks = marksOf(spec);
  const points = !!first && marks.every((m) => pointMarks.has(m.ariaLabel ?? ""));
  const padding = barPadding(first);
  const xTicks = !!first && x !== undefined && !isBand(x);
  const yTicks = gridY;
  const narrow = x === "band" && marks.some((m) => m.ariaLabel === "bar") && padding > 0.1;
  return {
    ...(points && { inset: pointInset }),
    x: {
      ...axis,
      ...(gridX && { grid: true }),
      ...(xTicks && { ticks: Math.max(2, Math.round(size.width / xTickSpacing)) }),
      ...(narrow && { padding }),
      ...spec.x,
    },
    y: {
      ...axis,
      labelAnchor: "top",
      ...(gridY && { grid: true }),
      ...(yTicks && { ticks: Math.max(3, Math.round(size.height / yTickSpacing)) }),
      ...spec.y,
    },
    fx: { ...axis, ...spec.fx },
    fy: { ...axis, ...spec.fy },
  };
}

/**
 * The padding of a band x scale that makes its bands `maxBarWidth` wide: with padding p inside and
 * outside, n bands over a range R are R (1 - p) / (n + p) wide.
 */
function barPadding(first: PlotDrawing | undefined): number {
  const x = first?.scale("x");
  const [a = 0, b = 0] = x?.range ?? [];
  const [range, n] = [Math.abs(b - a), x?.domain?.length ?? 0];
  return n ? (range - maxBarWidth * n) / (range + maxBarWidth) : 0;
}

/** The height of a chart before its scales are known, from its width. */
export function widthHeight(width: number): number {
  return Math.round(Math.min(maxHeight, Math.max(minHeight, width * heightRatio)));
}

/** The height of a chart whose y scale has bands: a step per band and facet, and the margins. */
export function bandHeight(first: PlotDrawing, margins: Margins): number | undefined {
  const y = first.scale("y");
  if (!isBand(typeOf(first, "y")) || !y?.domain) return;
  const facets = first.scale("fy")?.domain?.length ?? 1;
  const bands = y.domain.length * facets * bandStep;
  return Math.max(minBandHeight, Math.round(bands + margins.top + margins.bottom));
}
