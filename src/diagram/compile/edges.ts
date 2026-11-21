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
  type Route,
  type Side,
  toExpr,
} from "../elements.ts";
import {
  anchorOf,
  distance,
  normalOf,
  pathLength,
  type Rect,
  rayExit,
  round,
  sideExit,
  type Vec,
} from "../geometry.ts";
import { corner, edgeLabel, type Measure, type Metrics, selfLoop } from "../metrics.ts";
import { attachment } from "../outlines.ts";
import type { Layout } from "./layout.ts";
import { type Report, textLine } from "./text.ts";

/** Legs a curved edge is sampled into; even, so a vertex sits at the apex. */
const curveLegs = 16;

/** How a message names an edge end: a node's label, else the element's id, else "a point". */
function endpointName(p: PointLike): string {
  const el = elementOf(p);
  if (!el) return "a point";
  return el instanceof Node ? el.label || el.id : el.id;
}

/**
 * Where the line at a right angle to `side`, through `at` on that side, meets the circle of a dot
 * or a ring drawn in `rect`.
 */
function circleExit(rect: Rect, side: Side, at: Vec): Vec {
  const n = normalOf(side);
  const rx = rect.width / 2;
  const ry = rect.height / 2;
  const c = { x: rect.x + rx, y: rect.y + ry };
  const off = n.x ? (at.y - c.y) / ry : (at.x - c.x) / rx;
  const reach = Math.sqrt(Math.max(0, 1 - off * off));
  return n.x ? { x: c.x + n.x * rx * reach, y: at.y } : { x: at.x, y: c.y + n.y * ry * reach };
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
    const r = edge.route;
    let shape: { points: Vec[]; label: Partial<LabelOptions>; radius: number };
    if (typeof r === "object" && "loop" in r && fromEl) shape = loop(bounds(fromEl), r.loop);
    else if (typeof r === "object" && "bend" in r && r.bend)
      shape = curve(edge, r.bend, fromEl, toEl);
    else shape = { points: routed(edge, fromEl, toEl), label: {}, radius: corner.edge };
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
    const given = edge.route;
    const r =
      typeof given === "object" && ("bend" in given || "loop" in given) ? "straight" : given;
    if (r === "hv") middle.push({ x: end.x, y: start.y });
    else if (r === "vh") middle.push({ x: start.x, y: end.y });
    else if (typeof r === "object" && "via" in r) middle.push(...r.via.map(raw));
    else if (typeof r === "object" && "viaX" in r) {
      const x = typeof r.viaX === "number" ? r.viaX : raw(r.viaX).x;
      middle.push({ x, y: start.y }, { x, y: end.y });
    } else if (typeof r === "object" && "viaY" in r) {
      const y = typeof r.viaY === "number" ? r.viaY : raw(r.viaY).y;
      middle.push({ x: start.x, y }, { x: end.x, y });
    }
    if (fromEl) start = snap(fromEl, bounds(fromEl), start, middle[0] ?? end, r);
    if (toEl) end = snap(toEl, bounds(toEl), end, middle[middle.length - 1] ?? start, r);
    if (r === "hv" && middle[0]) middle[0] = { x: end.x, y: start.y };
    if (r === "vh" && middle[0]) middle[0] = { x: start.x, y: end.y };
    return [start, ...middle, end];
  }

  function curve(edge: Edge, bend: number, fromEl?: Element, toEl?: Element) {
    const a = evalPoint(toExpr(edge.from));
    const b = evalPoint(toExpr(edge.to));
    const len = distance(a, b) || 1;
    const normal = { x: (b.y - a.y) / len, y: -(b.x - a.x) / len };
    const control = {
      x: (a.x + b.x) / 2 + normal.x * 2 * bend,
      y: (a.y + b.y) / 2 + normal.y * 2 * bend,
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
    const out = { x: normal.x * Math.sign(bend), y: normal.y * Math.sign(bend) };
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
    const spread = Math.min(extent * selfLoop.spread, selfLoop.maxSpread);
    const at = (s: number, o: number) => ({
      x: base.x + along.x * s + out.x * o,
      y: base.y + along.y * s + out.y * o,
    });
    const labelSide = ({ top: "above", bottom: "below", left: "left", right: "right" } as const)[
      side
    ];
    return {
      points: [
        at(-spread, 0),
        at(-spread, selfLoop.size),
        at(spread, selfLoop.size),
        at(spread, 0),
      ],
      label: { segment: 1, side: labelSide },
      radius: corner.edge,
    };
  }

  function snap(el: Element, rect: Rect, center: Vec, toward: Vec, route: Route): Vec {
    const shape = el instanceof Node ? el.shape : "box";
    const form = { shape, replicas: el instanceof Node ? el.options.replicas : undefined };
    const circular = shape === "dot" || shape === "ring";
    if (route === "straight") {
      const c = anchorOf(rect, "center");
      const dir = { x: toward.x - c.x, y: toward.y - c.y };
      if (!dir.x && !dir.y) return c;
      if (shape === "cell" && el instanceof Node) return cellSide(el, rect, toward);
      if (circular) {
        const len = Math.hypot(dir.x, dir.y);
        return {
          x: c.x + (dir.x / len) * (rect.width / 2),
          y: c.y + (dir.y / len) * (rect.height / 2),
        };
      }
      return rayExit(attachment(form, rect), c, dir) ?? c;
    }
    const dx = toward.x - center.x;
    const dy = toward.y - center.y;
    const across = Math.abs(dx) >= Math.abs(dy);
    const side: Side = across ? (dx >= 0 ? "right" : "left") : dy >= 0 ? "bottom" : "top";
    const middle = anchorOf(rect, side);
    const within = (at: number, start: number, length: number) =>
      at >= start + corner.shape && at <= start + length - corner.shape;
    const at = across
      ? within(toward.y, rect.y, rect.height)
        ? { ...middle, y: toward.y }
        : middle
      : within(toward.x, rect.x, rect.width)
        ? { ...middle, x: toward.x }
        : middle;
    if (circular) return circleExit(rect, side, at);
    return sideExit(attachment(form, rect), rect, side, at) ?? at;
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
    const gap = l.gap ?? edgeLabel.gap;
    const font = { family: m.sans, size: m.smallSize, weight: m.edgeWeight };
    const lineHeight = font.size * m.lineHeight;
    const width = Math.max(...texts.map((line) => measure(line, font))) + 2 * edgeLabel.padX;
    const height = texts.length * lineHeight + 2 * edgeLabel.padY;
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
    if (
      legs === 1 &&
      (side === "above" || side === "below") !== vertical &&
      along + edgeLabel.room > leg
    )
      report(
        "LABEL_CROWDED",
        `${edge.id} label "${quoted}" needs ${round(along + edgeLabel.room)} units along segment ${segment}, which is ${round(leg)} long. Widen the gap or move the label.`,
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
