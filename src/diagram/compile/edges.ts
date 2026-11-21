/**
 * Edges: routes, curves, loops, endpoints snapped to outlines, arrowheads, and labels.
 */

import type { CompiledEdge, CompiledLabel } from "../drawing.ts";
import {
  type Edge,
  type Element,
  elementOf,
  type LabelOptions,
  Node,
  Point,
  type PointLike,
  type Side,
  toExpr,
} from "../elements.ts";
import {
  anchorOf,
  boundaryToward,
  distance,
  pathLength,
  type Rect,
  round,
  type Vec,
} from "../geometry.ts";
import { corner, type Measure, type Metrics } from "../metrics.ts";
import type { Layout } from "./layout.ts";
import { type Report, textLine } from "./text.ts";

/** Legs a curved edge is sampled into; even, so a vertex sits at the apex. */
const curveLegs = 16;
/** How far a self-loop reaches out from its node. */
const loopSize = 28;

/** How a message names an edge end: a node's label, else the element's id, else "a point". */
function endpointName(p: PointLike): string {
  const el = elementOf(p);
  if (!el) return "a point";
  return el instanceof Node ? el.label || el.id : el.id;
}

/** Drop consecutive points that coincide. */
function dedupe(points: Vec[]): Vec[] {
  return points.filter((p, i) => i === 0 || distance(p, points[i - 1] as Vec) > 0.01);
}

/**
 * Cut a line back by `cut` units from one end, along its last leg, so its stroke ends inside the
 * arrowhead. Points of a curve that the cut passes are dropped.
 */
function trim(points: Vec[], at: "start" | "end", cut: number) {
  if (at === "start") points.reverse();
  const tip = points[points.length - 1] as Vec;
  const prev = points[points.length - 2] as Vec;
  const len = distance(prev, tip) || 1;
  const end = {
    x: tip.x - ((tip.x - prev.x) / len) * cut,
    y: tip.y - ((tip.y - prev.y) / len) * cut,
  };
  while (points.length > 2 && distance(points[points.length - 2] as Vec, tip) <= cut)
    points.splice(points.length - 2, 1);
  points[points.length - 1] = end;
  if (at === "start") points.reverse();
}

/**
 * The edge compiler over a layout: `compileEdge` gives an edge's compiled form, with its heads and
 * labels, and its route before the heads cut the line back.
 */
export function createEdges(
  m: Metrics,
  measure: Measure,
  report: Report,
  layout: Layout,
  categoryOf: (name: string | undefined) => { category?: number },
) {
  const { bounds, evalPoint, cellSide } = layout;

  function compileEdge(edge: Edge): { compiled: CompiledEdge; route: Vec[] } {
    const fromEl = edge.from instanceof Point || Array.isArray(edge.from) ? undefined : edge.from;
    const toEl = edge.to instanceof Point || Array.isArray(edge.to) ? undefined : edge.to;
    let shape: { points: Vec[]; label: Partial<LabelOptions>; radius: number };
    if (fromEl && fromEl === toEl) shape = loop(bounds(fromEl), edge.loop);
    else if (edge.bend) {
      if (edge.route !== "straight")
        report("BEND_WITH_ROUTE", `${edge.id} has both bend and route; use one of them.`, [
          edge.id,
        ]);
      shape = curve(edge, fromEl, toEl);
    } else shape = { points: routed(edge, fromEl, toEl), label: {}, radius: 6 };
    const points = dedupe(shape.points);
    const heads: Vec[][] = [];
    const base: Omit<CompiledEdge, "labels" | "ariaLabel"> = {
      id: edge.id,
      role: edge.role,
      ...categoryOf(edge.category),
      ...(edge.dashed ? { dashed: true } : {}),
      head: edge.head,
      radius: shape.radius,
      ...(edge.passive ? { passive: true } : {}),
      ...(edge.stepOnly ? { stepOnly: true } : {}),
      points,
      heads,
    };
    if (points.length < 2) {
      report("DEGENERATE_EDGE", `${edge.id} starts and ends at the same point.`, [edge.id]);
      return { compiled: { ...base, labels: [], ariaLabel: edge.id }, route: points };
    }
    const labels = edge.labels.map((l) => placeLabel(edge, points, { ...shape.label, ...l }));
    const route = [...points];
    const curved = shape.radius === 0;
    const tips: Array<"start" | "end"> = [];
    if (edge.ends === "->" || edge.ends === "<->") tips.push("end");
    if (edge.ends === "<-" || edge.ends === "<->") tips.push("start");
    const made = tips.map((at) => arrowHead(route, at, edge.head === "open", curved));
    const crowded = made.find((h) => h.room < h.needs);
    if (crowded)
      report(
        "HEAD_CROWDED",
        `${edge.id} has ${round(crowded.room)} units for its arrowhead, which needs ${Math.ceil(crowded.needs)}. Widen the gap.`,
        [edge.id],
      );
    for (const h of made) {
      heads.push(h.head);
      trim(points, h.at, h.cut);
    }
    const text = edge.labels.map((l) => l.text.split("\n").join(" ")).join(", ");
    const ends = `from ${endpointName(edge.from)} to ${endpointName(edge.to)}`;
    const ariaLabel = text ? `${text}, ${ends}` : `Connection ${ends}`;
    return { compiled: { ...base, labels, ariaLabel }, route };
  }

  function routed(edge: Edge, fromEl?: Element, toEl?: Element): Vec[] {
    const raw = (p: PointLike) => evalPoint(toExpr(p));
    let start = raw(edge.from);
    let end = raw(edge.to);
    const middle: Vec[] = [];
    const r = edge.route;
    if (r === "hv") middle.push({ x: end.x, y: start.y });
    else if (r === "vh") middle.push({ x: start.x, y: end.y });
    else if (typeof r === "object" && "via" in r) middle.push(...r.via.map(raw));
    else if (typeof r === "object" && "viaX" in r) {
      const x = typeof r.viaX === "number" ? r.viaX : evalPoint(r.viaX.expr).x;
      middle.push({ x, y: start.y }, { x, y: end.y });
    } else if (typeof r === "object" && "viaY" in r) {
      const y = typeof r.viaY === "number" ? r.viaY : evalPoint(r.viaY.expr).y;
      middle.push({ x: start.x, y }, { x: end.x, y });
    }
    if (fromEl) start = snap(fromEl, bounds(fromEl), start, middle[0] ?? end, r);
    if (toEl) end = snap(toEl, bounds(toEl), end, middle[middle.length - 1] ?? start, r);
    if (r === "hv" && middle[0]) middle[0] = { x: end.x, y: start.y };
    if (r === "vh" && middle[0]) middle[0] = { x: start.x, y: end.y };
    return [start, ...middle, end];
  }

  function curve(edge: Edge, fromEl?: Element, toEl?: Element) {
    const a = evalPoint(toExpr(edge.from));
    const b = evalPoint(toExpr(edge.to));
    const len = distance(a, b) || 1;
    const normal = { x: (b.y - a.y) / len, y: -(b.x - a.x) / len };
    const control = {
      x: (a.x + b.x) / 2 + normal.x * 2 * edge.bend,
      y: (a.y + b.y) / 2 + normal.y * 2 * edge.bend,
    };
    const start = fromEl ? snap(fromEl, bounds(fromEl), a, control, "straight") : a;
    const end = toEl ? snap(toEl, bounds(toEl), b, control, "straight") : b;
    const points: Vec[] = [];
    for (let i = 0; i <= curveLegs; i++) {
      const t = i / curveLegs;
      const u = 1 - t;
      points.push({
        x: u * u * start.x + 2 * u * t * control.x + t * t * end.x,
        y: u * u * start.y + 2 * u * t * control.y + t * t * end.y,
      });
    }
    const out = { x: normal.x * Math.sign(edge.bend), y: normal.y * Math.sign(edge.bend) };
    const side: LabelOptions["side"] =
      Math.abs(out.y) >= Math.abs(out.x)
        ? out.y < 0
          ? "above"
          : "below"
        : out.x < 0
          ? "left"
          : "right";
    return { points, label: { segment: curveLegs / 2, at: 0, side }, radius: 0 };
  }

  function loop(rect: Rect, side: Side) {
    const base = anchorOf(rect, side);
    const out = {
      top: { x: 0, y: -1 },
      bottom: { x: 0, y: 1 },
      left: { x: -1, y: 0 },
      right: { x: 1, y: 0 },
    }[side];
    const along = { x: Math.abs(out.y), y: Math.abs(out.x) };
    const extent = out.x ? rect.height : rect.width;
    const spread = Math.min(extent * 0.3, 14);
    const at = (s: number, o: number) => ({
      x: base.x + along.x * s + out.x * o,
      y: base.y + along.y * s + out.y * o,
    });
    const labelSide = ({ top: "above", bottom: "below", left: "left", right: "right" } as const)[
      side
    ];
    return {
      points: [at(-spread, 0), at(-spread, loopSize), at(spread, loopSize), at(spread, 0)],
      label: { segment: 1, side: labelSide },
      radius: 6,
    };
  }

  function snap(el: Element, rect: Rect, center: Vec, toward: Vec, route: Edge["route"]): Vec {
    const shape = el instanceof Node ? el.shape : "box";
    if (route === "straight") {
      const c = anchorOf(rect, "center");
      const dx = toward.x - c.x;
      const dy = toward.y - c.y;
      if (shape === "diamond" && (dx || dy)) {
        const t = 1 / (Math.abs(dx) / (rect.width / 2) + Math.abs(dy) / (rect.height / 2));
        return { x: c.x + dx * t, y: c.y + dy * t };
      }
      if (shape === "cell" && el instanceof Node && (dx || dy)) return cellSide(el, rect, toward);
      if ((shape === "dot" || shape === "ring") && (dx || dy)) {
        const len = Math.hypot(dx, dy);
        return { x: c.x + (dx / len) * (rect.width / 2), y: c.y + (dy / len) * (rect.height / 2) };
      }
      return boundaryToward(rect, toward);
    }
    const dx = toward.x - center.x;
    const dy = toward.y - center.y;
    const across = Math.abs(dx) >= Math.abs(dy);
    const middle = across
      ? anchorOf(rect, dx >= 0 ? "right" : "left")
      : anchorOf(rect, dy >= 0 ? "bottom" : "top");
    if (shape === "diamond" || shape === "dot" || shape === "ring") return middle;
    const within = (at: number, start: number, length: number) =>
      at >= start + corner.shape && at <= start + length - corner.shape;
    if (across) return within(toward.y, rect.y, rect.height) ? { ...middle, y: toward.y } : middle;
    return within(toward.x, rect.x, rect.width) ? { ...middle, x: toward.x } : middle;
  }

  function arrowHead(route: Vec[], at: "start" | "end", open: boolean, curved: boolean) {
    const n = route.length;
    const tip = (at === "end" ? route[n - 1] : route[0]) as Vec;
    const prev = (at === "end" ? route[n - 2] : route[1]) as Vec;
    const len = distance(prev, tip) || 1;
    const room = curved ? pathLength(route) : len;
    const needs = m.headLength / 0.6;
    const ux = (tip.x - prev.x) / len;
    const uy = (tip.y - prev.y) / len;
    const hl = Math.min(m.headLength, room * 0.6);
    const base = { x: tip.x - ux * hl, y: tip.y - uy * hl };
    const hw = m.headWidth / 2;
    const left = { x: base.x - uy * hw, y: base.y + ux * hw };
    const right = { x: base.x + uy * hw, y: base.y - ux * hw };
    const notch = { x: tip.x - ux * hl * 0.72, y: tip.y - uy * hl * 0.72 };
    const head = open ? [left, tip, right] : [tip, left, notch, right];
    return { at, head, cut: hl * (open ? 0.08 : 0.55), room, needs };
  }
  function placeLabel(edge: Edge, points: Vec[], l: LabelOptions): CompiledLabel {
    const texts = l.text.split("\n");
    const quoted = texts.join(" ");
    const legs = points.length - 1;
    let segment = l.segment;
    if (segment === undefined) {
      segment = 0;
      for (let i = 1; i < legs; i++)
        if (
          distance(points[i] as Vec, points[i + 1] as Vec) >
          distance(points[segment] as Vec, points[segment + 1] as Vec) + 0.5
        )
          segment = i;
    } else if (segment < 0 || segment >= legs) {
      report(
        "LABEL_SEGMENT",
        `${edge.id} label "${quoted}" names segment ${segment}, but the route has ${legs} (0–${legs - 1}).`,
        [edge.id],
      );
      segment = Math.min(Math.max(segment, 0), legs - 1);
    }
    const a = points[segment] as Vec;
    const b = points[segment + 1] as Vec;
    const t = l.at ?? 0.5;
    const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    const vertical = Math.abs(b.x - a.x) < Math.abs(b.y - a.y);
    const side = l.side ?? (vertical ? "right" : "above");
    const gap = l.gap ?? 6;
    const font = { family: m.sans, size: m.smallSize, weight: m.edgeWeight };
    const lineHeight = font.size * m.lineHeight;
    const width = Math.max(...texts.map((line) => measure(line, font))) + 8;
    const height = texts.length * lineHeight + 2;
    let center: Vec;
    switch (side) {
      case "above":
        center = { x: p.x, y: p.y - gap - height / 2 };
        break;
      case "below":
        center = { x: p.x, y: p.y + gap + height / 2 };
        break;
      case "left":
        center = { x: p.x - gap - width / 2, y: p.y };
        break;
      case "right":
        center = { x: p.x + gap + width / 2, y: p.y };
        break;
    }
    const along = vertical ? height : width;
    const leg = distance(a, b);
    if (legs === 1 && (side === "above" || side === "below") !== vertical && along + 12 > leg)
      report(
        "LABEL_CROWDED",
        `${edge.id} label "${quoted}" needs ${round(along + 12)} units along segment ${segment}, which is ${round(leg)} long. Widen the gap or move the label.`,
        [edge.id],
      );
    const top = center.y - (texts.length * lineHeight) / 2;
    return {
      lines: texts.map((line, i) =>
        textLine(
          line,
          center.x,
          top + (i + 0.5) * lineHeight,
          { ...font, mono: false },
          false,
          "middle",
        ),
      ),
      rect: { x: center.x - width / 2, y: center.y - height / 2, width, height },
    };
  }

  return { compileEdge };
}
