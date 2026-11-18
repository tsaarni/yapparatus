/**
 * The outlines of drawn shapes as SVG path data. The reader's views and the picture writer
 * draw with the same functions, so a shape looks the same in both.
 */
import type { Rect, Vec } from "./geometry.ts";
import { cylinderCap, fragment, shapes } from "./metrics.ts";

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

/** A cylinder: its body with the bottom curve, and the ellipse of its top cap. */
export function cylinder(r: Rect) {
  const { x, y, width: w, height: h } = r;
  const ry = cylinderCap(w);
  const rx = w / 2;
  const top = y + ry;
  const bottom = y + h - ry;
  return {
    body: `M${x} ${top}A${rx} ${ry} 0 0 1 ${x + w} ${top}V${bottom}A${rx} ${ry} 0 0 1 ${x} ${bottom}Z`,
    cap: { cx: x + rx, cy: top, rx, ry },
  };
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

/** A note: its outline with the top-right corner cut, and the folded corner. */
export function note(r: Rect) {
  const { x, y, width: w, height: h } = r;
  const f = shapes.note.fold;
  return {
    body: `M${x} ${y}H${x + w - f}L${x + w} ${y + f}V${y + h}H${x}Z`,
    fold: `M${x + w - f} ${y}V${y + f}H${x + w}`,
  };
}

/** A decision's diamond, as polygon points. */
export function diamond(r: Rect): string {
  const { x, y, width: w, height: h } = r;
  return `${x + w / 2},${y} ${x + w},${y + h / 2} ${x + w / 2},${y + h} ${x},${y + h / 2}`;
}

/** Where a warning badge sits: on the part's top-right corner. */
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
