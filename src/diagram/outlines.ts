/**
 * The outlines of drawn shapes as SVG path data. The web app's views and the picture writer
 * draw with the same functions, so a shape looks the same in both.
 */
import type { Shape } from "./elements.ts";
import type { Rect, Vec } from "./geometry.ts";
import { cylinderCap, fragment, shapes } from "./metrics.ts";

/** Legs that a curve of an outline is sampled into for its attachment polygon. */
const curveLegs = 16;

/** A polyline whose bends are rounded by up to `radius`. */
export function roundedPath(points: Vec[], radius: number): string {
  const first = points[0];
  if (!first) return "";
  let d = `M${first.x} ${first.y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1] as Vec;
    const at = points[i] as Vec;
    const next = points[i + 1] as Vec;
    const inLen = Math.hypot(at.x - prev.x, at.y - prev.y);
    const outLen = Math.hypot(next.x - at.x, next.y - at.y);
    const r = Math.min(radius, inLen / 2, outLen / 2);
    if (r < 0.5) {
      d += `L${at.x} ${at.y}`;
      continue;
    }
    const a = { x: at.x - ((at.x - prev.x) / inLen) * r, y: at.y - ((at.y - prev.y) / inLen) * r };
    const b = {
      x: at.x + ((next.x - at.x) / outLen) * r,
      y: at.y + ((next.y - at.y) / outLen) * r,
    };
    d += `L${a.x} ${a.y}Q${at.x} ${at.y} ${b.x} ${b.y}`;
  }
  const last = points[points.length - 1] as Vec;
  return `${d}L${last.x} ${last.y}`;
}

/** Points as the `points` attribute of a polygon or polyline. */
export function pointList(points: Vec[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(" ");
}

/** A horizontal line across a rectangle at `y`, such as a record's title divider. */
export function rule(r: Rect, y: number): string {
  return `M${r.x} ${y}H${r.x + r.width}`;
}

/** Straight segments, such as a record's hairlines between cells. */
export function segments(lines: Array<[Vec, Vec]>): string {
  return lines.map(([a, b]) => `M${a.x} ${a.y}L${b.x} ${b.y}`).join("");
}

/** A cylinder's caps: the ellipse of the top cap, and the center of the bottom curve. */
function cylinderCaps(r: Rect) {
  const ry = cylinderCap(r.width);
  const rx = r.width / 2;
  return { cx: r.x + rx, top: r.y + ry, bottom: r.y + r.height - ry, rx, ry };
}

/** A cylinder: its body with the bottom curve, and the ellipse of its top cap. */
export function cylinder(r: Rect) {
  const { cx, top, bottom, rx, ry } = cylinderCaps(r);
  const { x, width: w } = r;
  return {
    body: `M${x} ${top}A${rx} ${ry} 0 0 1 ${x + w} ${top}V${bottom}A${rx} ${ry} 0 0 1 ${x} ${bottom}Z`,
    cap: { cx, cy: top, rx, ry },
  };
}

/** Points along an ellipse from angle `from` to `to`, in radians, with y growing downward. */
function arc(c: Vec, rx: number, ry: number, from: number, to: number): Vec[] {
  return Array.from({ length: curveLegs + 1 }, (_, i) => {
    const a = from + ((to - from) * i) / curveLegs;
    return { x: c.x + rx * Math.cos(a), y: c.y + ry * Math.sin(a) };
  });
}

/** A queue's caps: the ellipse of its right cap, and the center of its left curve. */
function queueCaps(r: Rect) {
  const rx = cylinderCap(r.height);
  const ry = r.height / 2;
  return { left: r.x + rx, right: r.x + r.width - rx, cy: r.y + ry, rx, ry };
}

/** A queue, a cylinder on its side: its body with the left curve, and its right cap. */
export function queue(r: Rect) {
  const { left, right, cy, rx, ry } = queueCaps(r);
  const { y, height: h } = r;
  return {
    body: `M${left} ${y}H${right}A${rx} ${ry} 0 0 1 ${right} ${y + h}H${left}A${rx} ${ry} 0 0 1 ${left} ${y}Z`,
    cap: { cx: right, cy, rx, ry },
  };
}

/** An input or output's parallelogram, as points: its top edge shifted right by the slant. */
export function parallelogram(r: Rect): Vec[] {
  const { x, y, width: w, height: h } = r;
  const s = shapes.io.slant;
  return [
    { x: x + s, y },
    { x: x + w, y },
    { x: x + w - s, y: y + h },
    { x, y: y + h },
  ];
}

/**
 * A document's wavy bottom as one cubic curve, from its bottom-right corner to its bottom-left.
 * It crosses the bottom line at the middle, rises on the right half, and dips on the left half.
 */
function wave(r: Rect): [Vec, Vec, Vec, Vec] {
  const { x, y, width: w, height: h } = r;
  const k = shapes.doc.wave * 2 * Math.sqrt(3);
  return [
    { x: x + w, y: y + h },
    { x: x + (2 * w) / 3, y: y + h - k },
    { x: x + w / 3, y: y + h + k },
    { x, y: y + h },
  ];
}

/** A document: a page whose bottom is a wave. */
export function page(r: Rect): string {
  const { x, y, width: w } = r;
  const [, c1, c2, end] = wave(r);
  return `M${x} ${y}H${x + w}V${r.y + r.height}C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${end.x} ${end.y}Z`;
}

/** Points along a cubic curve, from its start to the fraction `to` of the way. */
function cubic([a, b, c, d]: [Vec, Vec, Vec, Vec], to = 1): Vec[] {
  return Array.from({ length: curveLegs + 1 }, (_, i) => {
    const t = (i / curveLegs) * to;
    const u = 1 - t;
    const at = (p: number, q: number, s: number, e: number) =>
      u * u * u * p + 3 * u * u * t * q + 3 * u * t * t * s + t * t * t * e;
    return { x: at(a.x, b.x, c.x, d.x), y: at(a.y, b.y, c.y, d.y) };
  });
}

/** A shape, and how many of it a stack of replicas draws; one when `replicas` is not set. */
export interface Form {
  shape: Shape;
  replicas?: number | undefined;
}

/** How much wider and taller a stack of replicas is than the shape in front. */
export function stackRoom(replicas = 1): number {
  return (replicas - 1) * shapes.stack.offset;
}

/**
 * The rectangles of a stack of replicas, from the one at the back to the one in front. Each one
 * behind sits up and to the right of the one before. One replica is the rectangle itself.
 */
export function stack(r: Rect, replicas = 1): Rect[] {
  const o = shapes.stack.offset;
  const extra = stackRoom(replicas);
  return Array.from({ length: replicas }, (_, i) => ({
    x: r.x + extra - i * o,
    y: r.y + i * o,
    width: r.width - extra,
    height: r.height - extra,
  }));
}

/**
 * The room a shape's outline takes beyond the padding, and how far it moves the text's center
 * from the rectangle's. The room on one axis depends only on the size across it.
 */
export function room(kind: Shape, size: { width: number; height: number }) {
  switch (kind) {
    case "cylinder": {
      const cap = cylinderCap(size.width);
      return { width: 0, height: 2 * cap, dx: 0, dy: cap / 2 };
    }
    case "queue": {
      const cap = cylinderCap(size.height);
      return { width: 2 * cap, height: 0, dx: -cap / 2, dy: 0 };
    }
    case "io":
      return { width: shapes.io.slant, height: 0, dx: 0, dy: 0 };
    case "doc":
      return { width: 0, height: shapes.doc.wave, dx: 0, dy: -shapes.doc.wave / 2 };
    default:
      return { width: 0, height: 0, dx: 0, dy: 0 };
  }
}

/** A stick figure: its head as a circle, and its body, arms, and legs as one path. */
export function actor(r: Rect) {
  const cx = r.x + r.width / 2;
  const y = r.y;
  return {
    head: { cx, cy: y + 6.5, r: 5.5 },
    body: `M${cx} ${y + 12}V${y + 22}M${cx - 8} ${y + 15.5}H${cx + 8}M${cx} ${y + 22}L${cx - 6.5} ${y + 30}M${cx} ${y + 22}L${cx + 6.5} ${y + 30}`,
  };
}

/** A closed polygon as path data. */
function closed(points: Vec[]): string {
  return `${points.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join("")}Z`;
}

/** A note's outline: a rectangle with its top-right corner cut by the fold. */
function noteOutline(r: Rect): Vec[] {
  const { x, y, width: w, height: h } = r;
  const f = shapes.note.fold;
  return [
    { x, y },
    { x: x + w - f, y },
    { x: x + w, y: y + f },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
}

/** A note: its outline with the top-right corner cut, and the folded corner. */
export function note(r: Rect) {
  const { x, y, width: w } = r;
  const f = shapes.note.fold;
  return { body: closed(noteOutline(r)), fold: `M${x + w - f} ${y}V${y + f}H${x + w}` };
}

/** A decision's diamond, as polygon points. */
export function diamond(r: Rect): Vec[] {
  const { x, y, width: w, height: h } = r;
  return [
    { x: x + w / 2, y },
    { x: x + w, y: y + h / 2 },
    { x: x + w / 2, y: y + h },
    { x, y: y + h / 2 },
  ];
}

/** The corners of a rectangle, clockwise from the top left. */
function corners(r: Rect): Vec[] {
  const { x, y, width: w, height: h } = r;
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
}

/** The points along a box's or page's bottom, from its bottom-right corner leftward to `x`. */
function bottom(kind: Shape, r: Rect, x: number): Vec[] {
  const right = r.x + r.width;
  if (kind === "doc") return cubic(wave(r), (right - x) / r.width);
  return [
    { x: right, y: r.y + r.height },
    { x, y: r.y + r.height },
  ];
}

/**
 * The outline of a stack of boxes or pages, clockwise from the front one's top-left corner: steps
 * up its top-left, and down its bottom-right, where a shape behind shows its bottom on its right.
 */
function stackOutline(kind: Shape, rects: Rect[]): Vec[] {
  const points: Vec[] = [];
  for (let i = rects.length - 1; i >= 0; i--) {
    const r = rects[i] as Rect;
    const next = rects[i - 1];
    points.push({ x: r.x, y: r.y }, next ? { x: next.x, y: r.y } : { x: r.x + r.width, y: r.y });
  }
  rects.forEach((r, i) => {
    const before = rects[i + 1];
    points.push(...bottom(kind, r, before ? before.x + before.width : r.x));
  });
  return points;
}

/**
 * The outline that edges attach to, as a polygon that follows the drawn outline. Starts and ends
 * attach to their circle, so they and every shape without an outline of its own give the bounds.
 */
export function attachment(form: Form, r: Rect): Vec[] {
  const kind = form.shape;
  switch (kind) {
    case "box":
    case "doc":
      return stackOutline(kind, stack(r, form.replicas));
    case "decision":
      return diamond(r);
    case "note":
      return noteOutline(r);
    case "cylinder": {
      const { cx, top, bottom, rx, ry } = cylinderCaps(r);
      return [
        ...arc({ x: cx, y: top }, rx, ry, Math.PI, 2 * Math.PI),
        ...arc({ x: cx, y: bottom }, rx, ry, 0, Math.PI),
      ];
    }
    case "queue": {
      const { left, right, cy, rx, ry } = queueCaps(r);
      return [
        ...arc({ x: right, y: cy }, rx, ry, -Math.PI / 2, Math.PI / 2),
        ...arc({ x: left, y: cy }, rx, ry, Math.PI / 2, (3 * Math.PI) / 2),
      ];
    }
    case "io":
      return parallelogram(r);
    default:
      return corners(r);
  }
}

/** Where a warning badge sits: on the element's top-right corner. */
export function badgeCenter(r: Rect): Vec {
  return { x: r.x + r.width - 2, y: r.y + 2 };
}

/** The exclamation mark inside a warning badge centered at `c`. */
export function badgeMark(c: Vec): string {
  return `M${c.x} ${c.y - 3.5}V${c.y + 0.5}M${c.x} ${c.y + 3.2}V${c.y + 3.3}`;
}

/** A sequence fragment's operator tab, with its slanted lower-right corner. */
export function fragmentTab(r: Rect): string {
  const s = fragment.slant;
  return `M${r.x} ${r.y}H${r.x + r.width}V${r.y + r.height - s}L${r.x + r.width - s} ${r.y + r.height}H${r.x}Z`;
}

/** A rectangle grown by `pad` on every side; a negative pad shrinks it. */
export function outline(r: Rect, pad: number): Rect {
  return { x: r.x - pad, y: r.y - pad, width: r.width + 2 * pad, height: r.height + 2 * pad };
}
