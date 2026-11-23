/**
 * The look of a chart: one pass over Plot's drawing that sets colors, widths, and corners as
 * attributes from a paint, so a picture renderer without CSS draws it the same as a browser.
 */
import type { PlotDrawing } from "./margins.ts";
import type { Ramp } from "./ramp.ts";
import { type Matrix, parseTransform, transformOf } from "./text-box.ts";

/** The colors a chart paints with: theme values, as CSS variables or as literal colors. */
export interface ChartPaint {
  /** One color per category, in order. Categories past these take `textMuted`. */
  categories: readonly string[];
  /** Marks without a color of their own. */
  accent: string;
  /** The fill of a box plot's box, and the low end of the ramp. */
  accentSurface: string;
  /** Text on light cells of a heatmap. */
  text: string;
  /** Text marks. */
  textBody: string;
  /** Tick labels, axis labels, and box plot whiskers. */
  textMuted: string;
  /** Rules and the frame. */
  rule: string;
  /** Grid lines, drawn at `gridOpacity`. */
  grid: string;
  /** The figure's background: gaps between bars and cells, halos, and rings around dots. */
  surface: string;
  /** Amounts: from `accentSurface` at 0 to `accent` at 1. */
  ramp: Ramp;
}

/** Corner radius of a bar, in pixels. */
export const barRadius = 2.5;
/** Corner radius of a histogram's or interval's rect, which sits next to its neighbors. */
export const rectRadius = 1.5;
/** Corner radius of a heatmap cell. */
export const cellRadius = 3;
/** Width of the surface-colored gap around each heatmap cell. */
export const cellGap = 2;
/** Width of a line mark and of a regression line. */
export const lineWidth = 2;
/** Width of a link, whose arrowhead grows with it. */
export const linkWidth = 1.5;
/** Smallest radius of a dot, so its color shows. */
export const dotRadius = 4;
/** Opacity of a grid line in the grid color. */
export const gridOpacity = 0.6;
/** Opacity of areas colored by category, which keeps stacked areas from reading as heavy blocks. */
export const areaOpacity = 0.85;
/** Opacity of a regression's confidence band in the accent. */
export const bandOpacity = 0.14;
/** Ramp position above which a cell is dark enough for text in the surface color. */
export const darkCell = 0.55;

/** How the drawing is painted: the paint, ids, and the ramp position of each ramp color. */
export interface PaintOptions {
  paint: ChartPaint;
  /** Prefix of the ids the drawing defines, unique on the page. */
  id: string;
  /** The ramp position of each color the ramp returned while Plot drew. */
  rampPositions: ReadonlyMap<string, number>;
}

/** Plot's colors that stand for no color of the mark's own. */
const unset = (value: string | null) => value === null || value.toLowerCase() === "currentcolor";

/** The mark groups with an ARIA label, such as `"bar"`. */
const groups = (svg: Element, label: string) => [
  ...svg.querySelectorAll<SVGGElement>(`g[aria-label="${label}"]`),
];

/** Replace `currentColor` on an element and every element inside it. */
function replaceCurrent(root: Element, color: string) {
  for (const element of [root, ...root.querySelectorAll("*")])
    for (const name of ["fill", "stroke"])
      if (element.getAttribute(name)?.toLowerCase() === "currentcolor")
        element.setAttribute(name, color);
}

/** Set attributes on an element. */
function set(element: Element, attributes: Record<string, string | number>) {
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
}

/** A mark with an area: its fill is the accent when no channel colors it. */
function fillAccent(group: Element, paint: ChartPaint) {
  if (unset(group.getAttribute("fill"))) group.setAttribute("fill", paint.accent);
  replaceCurrent(group, paint.accent);
}

/** A mark group that no channel colors: neither it nor its shapes set a color of their own. */
function uncolored(group: Element): boolean {
  const own = (e: Element) =>
    ["fill", "stroke"].some((name) => {
      const value = e.getAttribute(name);
      return (
        value !== null && value !== "none" && !unset(value) && !value.startsWith("light-dark(")
      );
    });
  return !own(group) && ![...group.children].some(own);
}

/** Round the rects of a group. */
function round(group: Element, radius: number) {
  for (const rect of group.querySelectorAll("rect")) rect.setAttribute("rx", String(radius));
}

/** The groups of Plot's box marks, which it draws as a rule, a bar, a tick, and dots. */
function boxes(svg: Element) {
  return groups(svg, "bar").flatMap((bar) => {
    const rule = bar.previousElementSibling;
    const tick = bar.nextElementSibling;
    if (rule?.getAttribute("aria-label") !== "rule" || tick?.getAttribute("aria-label") !== "tick")
      return [];
    const dot = tick.nextElementSibling;
    const outliers = dot?.getAttribute("aria-label") === "dot" ? dot : undefined;
    return [{ rule, bar, tick, outliers }];
  });
}

/** Paint box plots: a tinted box or a category's, muted whiskers, and a marked median. */
function paintBoxes(svg: Element, paint: ChartPaint, done: Set<Element>) {
  for (const { rule, bar, tick, outliers } of boxes(svg)) {
    const plain = bar.getAttribute("fill")?.startsWith("light-dark(") ?? false;
    if (plain) set(bar, { fill: paint.accentSurface, stroke: paint.accent, "stroke-width": 1 });
    round(bar, barRadius);
    set(rule, { stroke: paint.textMuted });
    set(tick, { stroke: plain ? paint.accent : paint.surface, "stroke-width": lineWidth });
    done.add(rule).add(bar).add(tick);
    if (outliers) replaceCurrent(outliers, plain ? paint.accent : paint.textMuted);
  }
}

/** Paint dots: filled with their color, at least `dotRadius`, ringed in the surface color. */
function paintDots(group: Element, paint: ChartPaint) {
  const color = (value: string | null) =>
    value && value !== "none" ? (unset(value) ? paint.accent : value) : undefined;
  const shapes = [...group.querySelectorAll("circle, path")];
  const radii = new Set(shapes.map((s) => s.getAttribute("r")));
  for (const shape of shapes) {
    const own =
      color(shape.getAttribute("fill")) ??
      color(shape.getAttribute("stroke")) ??
      color(group.getAttribute("fill")) ??
      color(group.getAttribute("stroke")) ??
      paint.accent;
    set(shape, { fill: own, stroke: paint.surface, "stroke-width": 1 });
    const r = Number(shape.getAttribute("r"));
    if (radii.size === 1 && r) shape.setAttribute("r", String(Math.max(r, dotRadius)));
  }
  group.removeAttribute("stroke-width");
  set(group, { fill: paint.accent, stroke: paint.surface });
}

/** Paint a regression: a faint band, a line, and both clipped to the plot's frame. */
function paintRegression(svg: PlotDrawing, group: Element, options: PaintOptions, at: number) {
  const { paint } = options;
  fillAccent(group, paint);
  if (unset(group.getAttribute("stroke"))) group.setAttribute("stroke", paint.accent);
  group.removeAttribute("fill-opacity");
  group.setAttribute("stroke-width", String(lineWidth));
  for (const path of group.querySelectorAll("path"))
    if (path.getAttribute("stroke") === "none")
      path.setAttribute("fill-opacity", String(bandOpacity));
  const [x, y] = [svg.scale("x")?.range, svg.scale("y")?.range];
  if (!x?.length || !y?.length || svg.scale("fx") || svg.scale("fy")) return;
  const [, , , , e, f] = parseTransform(group.getAttribute("transform"));
  const document = svg.ownerDocument;
  const clip = document.createElementNS("http://www.w3.org/2000/svg", "clipPath");
  const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  const id = `${options.id}-clip-${at}`;
  clip.setAttribute("id", id);
  set(rect, {
    x: Math.min(...x) - e,
    y: Math.min(...y) - f,
    width: Math.max(...x) - Math.min(...x),
    height: Math.max(...y) - Math.min(...y),
  });
  clip.append(rect);
  svg.prepend(clip);
  group.setAttribute("clip-path", `url(#${id})`);
}

/** A point of an element's coordinates in the drawing's. */
function place(matrix: Matrix, x: number, y: number): [number, number] {
  const [a, b, c, d, e, f] = matrix;
  return [a * x + c * y + e, b * x + d * y + f];
}

/** Paint cells, and the texts drawn on them in a color that reads on the cell's ramp color. */
function paintCells(svg: Element, options: PaintOptions) {
  const { paint, rampPositions } = options;
  const cells = groups(svg, "cell").flatMap((group) => {
    fillAccent(group, paint);
    round(group, cellRadius);
    return [...group.querySelectorAll("rect")].map((rect) => {
      set(rect, { stroke: paint.surface, "stroke-width": cellGap });
      const number = (name: string) => Number(rect.getAttribute(name)) || 0;
      const matrix = transformOf(rect);
      const [left, top] = place(matrix, number("x"), number("y"));
      const [right, bottom] = place(
        matrix,
        number("x") + number("width"),
        number("y") + number("height"),
      );
      const fill = rect.getAttribute("fill") ?? group.getAttribute("fill") ?? "";
      return { left, top, right, bottom, position: rampPositions.get(fill) };
    });
  });
  if (!cells.length) return;
  for (const text of svg.querySelectorAll('g[aria-label="text"] text')) {
    const [x, y] = place(transformOf(text), Number(text.getAttribute("x")) || 0, 0);
    const cell = cells.find((c) => x >= c.left && x <= c.right && y >= c.top && y <= c.bottom);
    if (!cell) continue;
    const dark = (cell.position ?? 0) > darkCell;
    set(text, { stroke: "none", fill: dark ? paint.surface : paint.text, "font-weight": 500 });
  }
}

/**
 * Paint a Plot drawing. Marks without a color take the accent, tinted under such a line or dot;
 * categories and ramp colors stay. Bars and cells get round corners, texts a halo.
 */
export function paintDrawing(svg: PlotDrawing, options: PaintOptions) {
  const { paint } = options;
  for (const style of svg.querySelectorAll("style")) style.remove();
  const done = new Set<Element>();
  paintBoxes(svg, paint, done);
  const fresh = (label: string) => groups(svg, label).filter((g) => !done.has(g));
  const behind = [...fresh("line"), ...fresh("dot")].some(uncolored);
  const region = (group: Element) => {
    if (behind && uncolored(group))
      set(group, { fill: paint.accentSurface, stroke: paint.accent, "stroke-width": 1 });
    else fillAccent(group, paint);
  };
  for (const group of fresh("bar")) {
    region(group);
    round(group, barRadius);
  }
  for (const group of fresh("rect")) {
    if (!(behind && uncolored(group))) set(group, { stroke: paint.surface, "stroke-width": 1 });
    region(group);
    round(group, rectRadius);
  }
  for (const group of fresh("area")) {
    if (behind && uncolored(group)) group.setAttribute("fill", paint.accentSurface);
    else if (uncolored(group)) fillAccent(group, paint);
    else if (!group.hasAttribute("fill-opacity"))
      set(group, { "fill-opacity": areaOpacity, stroke: paint.surface, "stroke-width": 1 });
  }
  for (const group of fresh("line"))
    set(group, {
      "stroke-width": lineWidth,
      "stroke-linejoin": "round",
      "stroke-linecap": "round",
    });
  for (const label of ["line", "link", "tick", "arrow", "vector"])
    for (const group of fresh(label)) replaceCurrent(group, paint.accent);
  for (const group of fresh("link")) group.setAttribute("stroke-width", String(linkWidth));
  for (const group of fresh("dot")) paintDots(group, paint);
  groups(svg, "linear-regression").forEach((group, i) => {
    paintRegression(svg, group, options, i);
  });
  for (const group of groups(svg, "text")) {
    if (unset(group.getAttribute("fill"))) group.setAttribute("fill", paint.textBody);
    set(group, {
      stroke: paint.surface,
      "stroke-width": 3,
      "stroke-linejoin": "round",
      "paint-order": "stroke",
    });
  }
  paintCells(svg, options);
  for (const group of [...fresh("rule"), ...groups(svg, "frame")])
    replaceCurrent(group, paint.rule);
  for (const group of svg.querySelectorAll(
    'g[aria-label$="tick label"], g[aria-label$="axis label"]',
  ))
    group.setAttribute("fill", paint.textMuted);
  for (const group of svg.querySelectorAll('g[aria-label$="axis tick"]'))
    replaceCurrent(group, paint.rule);
  for (const group of svg.querySelectorAll('g[aria-label$="grid"]'))
    set(group, { stroke: paint.grid, "stroke-opacity": gridOpacity });
  replaceCurrent(svg, paint.textBody);
}
