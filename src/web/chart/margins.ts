/**
 * Chart margins that fit every label, measured from a first drawing: the chart draws again with
 * them so no label is cut off.
 */

/** Room kept between a label and the figure's edge, or another label. */
const labelClearance = 4;

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
 * Margins wide enough for every label, from a first drawing: grown by how far labels reach past
 * the edge or crowd the tick labels. Undefined when Plot's own margins fit.
 */
export function fitMargins(svg: PlotDrawing): Margins | undefined {
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
