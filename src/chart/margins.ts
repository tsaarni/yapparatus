/**
 * Chart margins that fit every label, from the label boxes of a first drawing: the chart draws
 * again with them so no label is cut off or runs into the tick labels.
 */
import type { Axis, Label, Labels } from "./labels.ts";
import { type Box, quadsOverlap } from "./text-box.ts";

/** Room kept between a label and the figure's edge, or another label. */
export const labelClearance = 4;

/** What Plot draws: an SVG element that also answers for its scales. */
export type PlotDrawing = SVGSVGElement & {
  scale: (name: string) => { domain?: unknown[]; range?: number[] } | undefined;
};

/** Space in pixels around a chart's plot area, as Plot's margin options take it. */
export interface Margins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** A drawing's width and height, from its attributes. */
export function sizeOf(svg: Element): { width: number; height: number } {
  return {
    width: Number(svg.getAttribute("width")) || 0,
    height: Number(svg.getAttribute("height")) || 0,
  };
}

/** The margins Plot chose for a drawing, read from where its outer scales start and end. */
export function marginsOf(svg: PlotDrawing): Margins {
  const { width, height } = sizeOf(svg);
  const extent = (name: string) => {
    const range = svg.scale(name)?.range;
    return range?.length ? [Math.min(...range), Math.max(...range)] : undefined;
  };
  const [left = 0, right = width] = extent("fx") ?? extent("x") ?? [];
  const [top = 0, bottom = height] = extent("fy") ?? extent("y") ?? [];
  return { top, right: width - right, bottom: height - bottom, left };
}

/** The axes whose tick labels share a side with an axis's label. */
const alongside: Record<Axis, Axis[]> = {
  x: ["x", "fx"],
  fx: ["x", "fx"],
  y: ["y", "fy"],
  fy: ["y", "fy"],
};

/** The box grown by the clearance on every side, as a quad. */
function padded(box: Box) {
  const [l, t, r, b] = [
    box.left - labelClearance,
    box.top - labelClearance,
    box.right + labelClearance,
    box.bottom + labelClearance,
  ];
  return [
    [l, t],
    [r, t],
    [r, b],
    [l, b],
  ] as Label["quads"][number];
}

/** The tick labels of the axes beside an axis's label that come closer to it than the clearance. */
export function crowding(labels: Labels, axis: Axis, title: Label): Label[] {
  const around = padded(title.box);
  return alongside[axis]
    .flatMap((a) => labels.ticks[a])
    .filter((tick) => tick.quads.some((q) => quadsOverlap(around, q)));
}

/**
 * Margins grown by how far labels reach past the edge, and axis labels crowd tick labels on their
 * side; Plot keeps axis labels at the edge. Undefined when Plot's own margins fit.
 */
export function fitMargins(svg: PlotDrawing, labels: Labels): Margins | undefined {
  const { width, height } = sizeOf(svg);
  const base = marginsOf(svg);
  const over = { top: 0, right: 0, bottom: 0, left: 0 };
  for (const { box } of labels.all) {
    over.left = Math.max(over.left, -box.left);
    over.right = Math.max(over.right, box.right - width);
    over.top = Math.max(over.top, -box.top);
    over.bottom = Math.max(over.bottom, box.bottom - height);
  }
  const plotBottom = height - base.bottom;
  for (const [axis, title] of Object.entries(labels.titles) as [Axis, Label][]) {
    const ticks = crowding(labels, axis, title).map((t) => t.box);
    if (!ticks.length) continue;
    const { box } = title;
    const most = (side: (b: Box) => number) => Math.max(...ticks.map(side));
    const least = (side: (b: Box) => number) => Math.min(...ticks.map(side));
    const [middleX, middleY] = [(box.left + box.right) / 2, (box.top + box.bottom) / 2];
    if (middleY < base.top)
      over.top = Math.max(over.top, box.bottom + labelClearance - least((b) => b.top));
    else if (middleY > plotBottom)
      over.bottom = Math.max(over.bottom, most((b) => b.bottom) + labelClearance - box.top);
    else if (middleX < base.left)
      over.left = Math.max(over.left, box.right + labelClearance - least((b) => b.left));
    else over.right = Math.max(over.right, most((b) => b.right) + labelClearance - box.left);
  }
  if (Object.values(over).every((n) => n <= 0)) return;
  const grow = (side: keyof Margins) =>
    over[side] > 0 ? Math.ceil(base[side] + over[side] + labelClearance) : base[side];
  return { top: grow("top"), right: grow("right"), bottom: grow("bottom"), left: grow("left") };
}
