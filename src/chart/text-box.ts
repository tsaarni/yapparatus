/**
 * The box an SVG `<text>` covers, computed from its attributes and a text measure, so a chart's
 * labels are laid out the same in a browser and on the server, which has no layout engine.
 */
import type { Measure } from "../diagram/metrics.ts";

/** A rectangle in the drawing's coordinates. */
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * The font a chart's text is set in: its family, size in pixels, weight, and its ascent and
 * descent in em. A mark may set its own size or weight; the drawing's attributes say so.
 */
export interface ChartFont {
  family: string;
  size: number;
  weight: number;
  ascent: number;
  descent: number;
}

/** An affine transform as SVG writes it: `[a, b, c, d, e, f]`. */
export type Matrix = [number, number, number, number, number, number];

const identity: Matrix = [1, 0, 0, 1, 0, 0];

/** The product of two transforms: `outer` applied after `inner`. */
function multiply(outer: Matrix, inner: Matrix): Matrix {
  const [a, b, c, d, e, f] = outer;
  const [a2, b2, c2, d2, e2, f2] = inner;
  return [
    a * a2 + c * b2,
    b * a2 + d * b2,
    a * c2 + c * d2,
    b * c2 + d * d2,
    a * e2 + c * f2 + e,
    b * e2 + d * f2 + f,
  ];
}

/** The transform an SVG `transform` attribute names, from its translate, rotate, and scale. */
export function parseTransform(value: string | null): Matrix {
  let matrix = identity;
  for (const [, name, args = ""] of (value ?? "").matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
    const [p = 0, q, r] = args
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number);
    let step: Matrix = identity;
    if (name === "translate") step = [1, 0, 0, 1, p, q ?? 0];
    else if (name === "scale") step = [p, 0, 0, q ?? p, 0, 0];
    else if (name === "rotate") {
      const angle = (p * Math.PI) / 180;
      const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
      const [cx, cy] = [q ?? 0, r ?? 0];
      step = [cos, sin, -sin, cos, cx - cos * cx + sin * cy, cy - sin * cx - cos * cy];
    } else if (name === "matrix") step = args.split(/[\s,]+/).map(Number) as Matrix;
    matrix = multiply(matrix, step);
  }
  return matrix;
}

/** A presentation property, from the element's style first and then its attribute. */
function property(element: Element, name: string): string | undefined {
  const style = element.getAttribute("style");
  const styled = style && new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`).exec(style)?.[1];
  return styled?.trim() || element.getAttribute(name) || undefined;
}

/** An inherited presentation property: the nearest one set on the element or its ancestors. */
function inherited(element: Element, name: string): string | undefined {
  for (let at: Element | null = element; at; at = at.parentElement) {
    const value = property(at, name);
    if (value !== undefined && value !== "inherit") return value;
  }
  return undefined;
}

/** A length in pixels: a number, `px`, or `em` of the font size. */
function length(value: string | null | undefined, fontSize: number): number {
  if (!value) return 0;
  const number = Number.parseFloat(value);
  if (Number.isNaN(number)) return 0;
  return value.trim().endsWith("em") ? number * fontSize : number;
}

/** A run of text set from one position, which its anchor aligns as a whole. */
interface Chunk {
  x: number;
  y: number;
  text: string;
}

/** The chunks of a text: each tspan that sets `x` or `y` starts a new one. */
function chunksOf(text: Element, fontSize: number): Chunk[] {
  const at = (name: string) => length(text.getAttribute(name), fontSize);
  let x = at("x") + at("dx");
  let y = at("y") + at("dy");
  const chunks: Chunk[] = [{ x, y, text: "" }];
  for (const node of text.childNodes) {
    if (node.nodeType === 3) {
      (chunks.at(-1) as Chunk).text += node.textContent ?? "";
      continue;
    }
    if (node.nodeType !== 1 || (node as Element).tagName.toLowerCase() !== "tspan") continue;
    const span = node as Element;
    const value = (name: string) => span.getAttribute(name);
    const moved = value("x") !== null || value("y") !== null;
    if (value("x") !== null) x = length(value("x"), fontSize);
    if (value("y") !== null) y = length(value("y"), fontSize);
    x += length(value("dx"), fontSize);
    y += length(value("dy"), fontSize);
    const chunk = chunks.at(-1) as Chunk;
    const content = span.textContent ?? "";
    if (moved || value("dy") !== null) chunks.push({ x, y, text: content });
    else chunk.text += content;
  }
  return chunks.filter((c) => c.text.length > 0);
}

/** The transform from an element's coordinates to its root `<svg>`'s, with its own transform. */
export function transformOf(element: Element): Matrix {
  let matrix = identity;
  for (let at: Element | null = element; at; at = at.parentElement) {
    if (at.tagName.toLowerCase() === "svg") break;
    matrix = multiply(parseTransform(at.getAttribute("transform")), matrix);
  }
  return matrix;
}

/** An element's font size in pixels, inherited, as CSS gives it: a style beats an attribute. */
function fontSizeOf(element: Element, fallback: number): number {
  return length(inherited(element, "font-size"), fallback) || fallback;
}

/** A text chunk's rectangle in its `<svg>`'s coordinates: four corners, turned with the text. */
export type Quad = [Point, Point, Point, Point];
/** A point in the drawing's coordinates. */
export type Point = [number, number];

/**
 * The rectangles a `<text>` covers, one per chunk: each is as wide as the measure says and as
 * tall as the font's ascent and descent, turned and moved as the text's transforms say.
 */
export function textQuads(text: Element, font: ChartFont, measure: Measure): Quad[] {
  const size = fontSizeOf(text, font.size);
  const weight = Number(inherited(text, "font-weight")) || font.weight;
  const anchor = inherited(text, "text-anchor") ?? "start";
  const shift = anchor === "middle" ? 0.5 : anchor === "end" ? 1 : 0;
  const variant = `${inherited(text, "font-variant") ?? ""} ${inherited(text, "font-variant-numeric") ?? ""}`;
  const spec = { family: font.family, size, weight, tabular: variant.includes("tabular-nums") };
  const [a, b, c, d, e, f] = transformOf(text);
  const place = (x: number, y: number): Point => [a * x + c * y + e, b * x + d * y + f];
  return chunksOf(text, size).map((chunk) => {
    const width = measure(chunk.text, spec);
    const left = chunk.x - width * shift;
    const top = chunk.y - font.ascent * size;
    const bottom = chunk.y + font.descent * size;
    return [
      place(left, top),
      place(left + width, top),
      place(left + width, bottom),
      place(left, bottom),
    ];
  });
}

/** The smallest box that holds the quads, or undefined when there are none. */
export function boundsOf(quads: Quad[]): Box | undefined {
  const points = quads.flat();
  if (!points.length) return undefined;
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  return {
    left: Math.min(...xs),
    top: Math.min(...ys),
    right: Math.max(...xs),
    bottom: Math.max(...ys),
  };
}

/** The box a `<text>` covers in its `<svg>`'s coordinates, or undefined if it has no characters. */
export function textBox(text: Element, font: ChartFont, measure: Measure): Box | undefined {
  return boundsOf(textQuads(text, font, measure));
}

/**
 * Do two quads overlap by more than `tolerance` pixels? They do when no edge of either separates
 * them, the separating axis test for convex shapes.
 */
export function quadsOverlap(a: Quad, b: Quad, tolerance = 0): boolean {
  for (const quad of [a, b])
    for (let i = 0; i < 2; i++) {
      const [x1, y1] = quad[i] as Point;
      const [x2, y2] = quad[i + 1] as Point;
      const length = Math.hypot(x2 - x1, y2 - y1);
      if (!length) continue;
      const axis: Point = [(y1 - y2) / length, (x2 - x1) / length];
      const project = (q: Quad) => q.map(([x, y]) => x * axis[0] + y * axis[1]);
      const [pa, pb] = [project(a), project(b)];
      const overlap =
        Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb));
      if (overlap <= tolerance) return false;
    }
  return true;
}
