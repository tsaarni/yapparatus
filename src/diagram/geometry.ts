/** Plain geometry in SVG user units: x grows rightward, y grows downward. */

export interface Vec {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Side = "top" | "bottom" | "left" | "right";

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
export type AnchorName = (typeof ANCHORS)[number];

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

export function inflate(r: Rect, dx: number, dy = dx): Rect {
  return { x: r.x - dx, y: r.y - dy, width: r.width + 2 * dx, height: r.height + 2 * dy };
}

/** Overlap area as width × height, or undefined when the rectangles do not overlap. */
export function overlap(a: Rect, b: Rect): { width: number; height: number } | undefined {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return width > 0.5 && height > 0.5 ? { width, height } : undefined;
}

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

/** Where a ray from the rectangle's center toward `toward` leaves the rectangle. */
export function boundaryToward(rect: Rect, toward: Vec): Vec {
  const c = anchorOf(rect, "center");
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const sx = dx === 0 ? Number.POSITIVE_INFINITY : rect.width / 2 / Math.abs(dx);
  const sy = dy === 0 ? Number.POSITIVE_INFINITY : rect.height / 2 / Math.abs(dy);
  const s = Math.min(sx, sy);
  return { x: c.x + dx * s, y: c.y + dy * s };
}

export function distance(a: Vec, b: Vec): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function round(n: number): number {
  return Math.round(n * 100) / 100;
}
