/**
 * Edges: routes, curves, loops, endpoints snapped to outlines, arrowheads, and labels.
 */

import type { CompiledEdge, CompiledLabel } from "./compiled.ts";
import { anchorOf, boundaryToward, distance, type Rect, round, type Vec } from "./geometry.ts";
import type { Layout } from "./layout.ts";
import type { Measure, Metrics } from "./metrics.ts";
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
} from "./scene.ts";
import type { Report } from "./text.ts";

/** Legs a curved edge is sampled into; even, so a vertex sits at the apex. */
const curveLegs = 16;
/** How far a self-loop reaches out from its node. */
const loopSize = 28;

function endpointName(p: PointLike): string {
  const el = elementOf(p);
  if (!el) return "a point";
  return el instanceof Node ? el.label || el.id : el.id;
}

function dedupe(points: Vec[]): Vec[] {
  return points.filter((p, i) => i === 0 || distance(p, points[i - 1] as Vec) > 0.01);
}

export function createEdges(
  m: Metrics,
  measure: Measure,
  report: Report,
  layout: Layout,
  categoryOf: (name: string | undefined) => { category?: number },
) {
  const { bounds, evalPoint, cellSide } = layout;

  function compileEdge(edge: Edge): CompiledEdge {
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
    const base = {
      id: edge.id,
      explicitId: edge.explicitId,
      role: edge.role,
      ...categoryOf(edge.category),
      dashed: edge.dashed,
      head: edge.head,
      radius: shape.radius,
      passive: edge.passive,
      stepOnly: edge.stepOnly,
      points,
      heads,
    };
    if (points.length < 2) {
      report("DEGENERATE_EDGE", `${edge.id} starts and ends at the same point.`, [edge.id]);
      return { ...base, labels: [], ariaLabel: edge.id };
    }
    const labels = edge.labels.map((l) => placeLabel(edge, points, { ...shape.label, ...l }));
    const open = edge.head === "open";
    if (edge.ends === "->" || edge.ends === "<->") heads.push(arrowHead(points, "end", open));
    if (edge.ends === "<-" || edge.ends === "<->") heads.push(arrowHead(points, "start", open));
    const text = edge.labels.map((l) => l.text).join(", ");
    const ends = `from ${endpointName(edge.from)} to ${endpointName(edge.to)}`;
    return { ...base, labels, ariaLabel: text ? `${text}, ${ends}` : `Connection ${ends}` };
  }

  /** The vertices of a straight or routed edge, with element endpoints snapped. */
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
    // Elbow corners depend on snapped endpoints when an element endpoint is used.
    if (r === "hv" && middle[0]) middle[0] = { x: end.x, y: start.y };
    if (r === "vh" && middle[0]) middle[0] = { x: start.x, y: end.y };
    return [start, ...middle, end];
  }

  /**
   * A quadratic curve that bows `bend` units to the left of the direction of travel,
   * sampled into short legs. The label sits at the apex, outside the curve.
   */
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

  /** A self-loop: out of one side, around, and back into the same side. */
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

  /**
   * Snap an element endpoint to its outline. A straight edge leaves along the ray
   * toward its neighbour point; routed edges leave from the side facing their first leg.
   */
  function snap(el: Element, rect: Rect, center: Vec, toward: Vec, route: Edge["route"]): Vec {
    if (route === "straight") {
      const shape = el instanceof Node ? el.shape : "box";
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
    if (Math.abs(dx) >= Math.abs(dy)) return anchorOf(rect, dx >= 0 ? "right" : "left");
    return anchorOf(rect, dy >= 0 ? "bottom" : "top");
  }

  function arrowHead(points: Vec[], at: "start" | "end", open = false): Vec[] {
    const n = points.length;
    const tip = (at === "end" ? points[n - 1] : points[0]) as Vec;
    const prev = (at === "end" ? points[n - 2] : points[1]) as Vec;
    const len = distance(prev, tip) || 1;
    const ux = (tip.x - prev.x) / len;
    const uy = (tip.y - prev.y) / len;
    const hl = Math.min(m.headLength, len * 0.6);
    // Shorten the line so its stroke ends inside the head instead of poking through the tip.
    const base = { x: tip.x - ux * hl, y: tip.y - uy * hl };
    // Filled heads hide the line end; open heads meet the line at their tip.
    const keep = open ? 0.08 : 0.55;
    const end = { x: tip.x - ux * hl * keep, y: tip.y - uy * hl * keep };
    if (at === "end") points[n - 1] = end;
    else points[0] = end;
    const hw = m.headWidth / 2;
    const left = { x: base.x - uy * hw, y: base.y + ux * hw };
    const right = { x: base.x + uy * hw, y: base.y - ux * hw };
    if (open) return [left, tip, right];
    // A "stealth" head: the back is notched toward the tip.
    const notch = { x: tip.x - ux * hl * 0.72, y: tip.y - uy * hl * 0.72 };
    return [tip, left, notch, right];
  }

  function placeLabel(edge: Edge, points: Vec[], l: LabelOptions): CompiledLabel {
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
        `${edge.id} label "${l.text}" names segment ${segment}, but the route has ${legs} (0–${legs - 1}).`,
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
    const width = measure(l.text, font) + 8;
    const height = m.smallSize * m.lineHeight + 2;
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
    // On a single-leg edge, the leg is the gap between its two ends: a label running
    // along it must fit inside, clear of both. Bent routes rely on the overlap checks.
    const along = vertical ? height : width;
    const leg = distance(a, b);
    if (legs === 1 && (side === "above" || side === "below") !== vertical && along + 12 > leg)
      report(
        "LABEL_CROWDED",
        `${edge.id} label "${l.text}" needs ${round(along + 12)} units along segment ${segment}, which is ${round(leg)} long. Widen the gap or move the label.`,
        [edge.id],
      );
    return {
      text: l.text,
      center,
      size: font.size,
      weight: font.weight,
      rect: { x: center.x - width / 2, y: center.y - height / 2, width, height },
    };
  }

  return { compileEdge };
}
