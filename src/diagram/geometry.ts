/** Plain geometry in SVG user units: x grows rightward, y grows downward. */

/** A point or a direction. */
export interface Vec {
  x: number;
  y: number;
}

/** An axis-aligned rectangle from its top-left corner. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A side of a rectangle, where ports sit and edges attach. */
export type Side = "top" | "bottom" | "left" | "right";

/** The named points on a rectangle that elements expose, such as `el.topLeft`. */
export const ANCHORS = [
  "center",
  "top",
  "bottom",
  "left",
  "right",
  "topLeft",
  "topRight",
  "bottomLeft",
  "bottomRight",
] as const;
/** The name of one of the `ANCHORS`. */
export type AnchorName = (typeof ANCHORS)[number];

/** The coordinates of a named anchor on a rectangle. */
export function anchorOf(rect: Rect, name: AnchorName): Vec {
  const { x, y, width: w, height: h } = rect;
  const cx = x + w / 2;
  const cy = y + h / 2;
  switch (name) {
    case "center":
      return { x: cx, y: cy };
    case "top":
      return { x: cx, y };
    case "bottom":
      return { x: cx, y: y + h };
    case "left":
      return { x, y: cy };
    case "right":
      return { x: x + w, y: cy };
    case "topLeft":
      return { x, y };
    case "topRight":
      return { x: x + w, y };
    case "bottomLeft":
      return { x, y: y + h };
    case "bottomRight":
      return { x: x + w, y: y + h };
  }
}

/** A point along one side: `t` runs 0→1 left→right on top and bottom, top→bottom on the sides. */
export function portOf(rect: Rect, side: Side, t: number): Vec {
  const { x, y, width: w, height: h } = rect;
  switch (side) {
    case "top":
      return { x: x + w * t, y };
    case "bottom":
      return { x: x + w * t, y: y + h };
    case "left":
      return { x, y: y + h * t };
    case "right":
      return { x: x + w, y: y + h * t };
  }
}

/** The smallest rectangle that covers every given one, or undefined for none. */
export function union(rects: Rect[]): Rect | undefined {
  if (rects.length === 0) return;
  let x0 = Number.POSITIVE_INFINITY;
  let y0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let y1 = Number.NEGATIVE_INFINITY;
  for (const r of rects) {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.width);
    y1 = Math.max(y1, r.y + r.height);
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** Grow a rectangle by dx on the left and right and dy on the top and bottom; negative shrinks. */
export function inflate(r: Rect, dx: number, dy = dx): Rect {
  return { x: r.x - dx, y: r.y - dy, width: r.width + 2 * dx, height: r.height + 2 * dy };
}

/** Overlap area as width × height, or undefined when the rectangles do not overlap. */
export function overlap(a: Rect, b: Rect): { width: number; height: number } | undefined {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return width > 0.5 && height > 0.5 ? { width, height } : undefined;
}

/** Whether `inner` lies inside `outer`, with half a unit of tolerance. */
export function contains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x - 0.5 &&
    inner.y >= outer.y - 0.5 &&
    inner.x + inner.width <= outer.x + outer.width + 0.5 &&
    inner.y + inner.height <= outer.y + outer.height + 0.5
  );
}

/** Liang–Barsky: does segment a→b pass through the interior of rect? */
export function segmentHitsRect(a: Vec, b: Vec, rect: Rect): boolean {
  const r = inflate(rect, -1);
  if (r.width <= 0 || r.height <= 0) return false;
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const edges: Array<[number, number]> = [
    [-dx, a.x - r.x],
    [dx, r.x + r.width - a.x],
    [-dy, a.y - r.y],
    [dy, r.y + r.height - a.y],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return false;
  }
  return t1 - t0 > 1e-6;
}

/**
 * The side of `rect` that a line from its center toward `toward` crosses first, of `allowed`.
 * A wide rectangle therefore takes its bottom for a point below it, even one far to the side.
 */
export function sideToward(
  rect: Rect,
  toward: Vec,
  allowed: readonly Side[] = ["top", "bottom", "left", "right"],
): Side {
  const c = anchorOf(rect, "center");
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  const w = rect.width / 2;
  const h = rect.height / 2;
  const progress = { left: -dx * h, right: dx * h, top: -dy * w, bottom: dy * w };
  return allowed.reduce((a, b) => (progress[b] > progress[a] ? b : a));
}

/** Where a line from the center of `rect` toward `toward` crosses its outline. */
export function boundaryToward(rect: Rect, toward: Vec): Vec {
  const c = anchorOf(rect, "center");
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const side = sideToward(rect, toward);
  const s =
    side === "left" || side === "right"
      ? rect.width / 2 / Math.abs(dx)
      : rect.height / 2 / Math.abs(dy);
  return { x: c.x + dx * s, y: c.y + dy * s };
}

/** The straight-line distance between two points. */
export function distance(a: Vec, b: Vec): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** The length of a polyline. */
export function pathLength(points: Vec[]): number {
  return points.slice(1).reduce((sum, p, i) => sum + distance(points[i] as Vec, p), 0);
}

/** The point at a distance along a polyline, or its last point past the end. */
export function pointAlong(points: Vec[], at: number): Vec {
  let left = at;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i] as Vec;
    const b = points[i + 1] as Vec;
    const len = distance(a, b);
    if (left <= len && len > 0)
      return { x: a.x + ((b.x - a.x) * left) / len, y: a.y + ((b.y - a.y) * left) / len };
    left -= len;
  }
  return points[points.length - 1] as Vec;
}

/** Round to hundredths, the precision a compiled drawing keeps. */
export function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Every number in a value rounded to hundredths, the precision a compiled drawing keeps. */
export function rounded<T>(value: T): T {
  if (typeof value === "number") return round(value) as T;
  if (Array.isArray(value)) return value.map(rounded) as T;
  if (typeof value === "object" && value !== null)
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rounded(v)])) as T;
  return value;
}
