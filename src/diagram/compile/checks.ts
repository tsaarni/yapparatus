/**
 * Checks over the scene and the compiled drawing: ids, positions, overlaps, crossings.
 */

import type { DiagramBuilder } from "../builder.ts";
import type { CompiledEdge, CompiledEnclosure, CompiledLabel, CompiledNode } from "../drawing.ts";
import { type Element, Enclosure, elementOf, Grid, Node, type PointLike } from "../elements.ts";
import {
  contains,
  distance,
  inflate,
  overlap,
  pathLength,
  pointAlong,
  type Rect,
  round,
  segmentHitsRect,
  union,
  type Vec,
} from "../geometry.ts";
import { enclosure } from "../metrics.ts";
import type { Report } from "./text.ts";

/**
 * Settle ids in dependency order: shapes and containers, then members, then edges.
 * Explicit ids are fixed; derived ids get a numeric suffix when they collide.
 */
export function checkIds(scene: DiagramBuilder, report: Report) {
  const taken = new Set<string>();
  const settle = (all: Array<{ id: string; explicitId: boolean }>) => {
    for (const el of all.filter((e) => e.explicitId)) {
      if (taken.has(el.id)) report("DUPLICATE_ID", `Two elements use id "${el.id}".`, [el.id]);
      taken.add(el.id);
    }
    for (const el of all.filter((e) => !e.explicitId)) {
      const base = el.id;
      for (let n = 2; taken.has(el.id); n++) el.id = `${base}-${n}`;
      taken.add(el.id);
    }
  };
  const members = scene.nodes.filter((n) => n.member);
  settle([...scene.nodes.filter((n) => !n.member), ...scene.grids, ...scene.enclosures]);
  for (const m of members) if (m.member) m.id = `${m.member.parent.id}.${m.member.own}`;
  settle(members.map((m) => ({ id: m.id, explicitId: true })));
  for (const edge of scene.edges) edge.deriveId();
  settle(scene.edges);
}

/** Every element needs a position owner; all but the first without one are reported. */
export function checkPlaced(scene: DiagramBuilder, report: Report) {
  const roots = [...scene.nodes, ...scene.grids].filter(
    (el) => !scene.owner.has(el) && !(el instanceof Node && el.member),
  );
  const firstRoot = roots[0];
  if (roots.length > 1)
    report(
      "UNPLACED",
      `${roots
        .slice(1)
        .map((r) => r.id)
        .join(
          ", ",
        )} ${roots.length > 2 ? "have" : "has"} no position; placed at the origin over ${firstRoot?.id}. Add them to a row/column or place() them.`,
      roots.slice(1).map((r) => r.id),
    );
}

/** Check the compiled drawing: accent overuse, overlaps, crossings, and enclosure intrusions. */
export function validate(
  scene: DiagramBuilder,
  nodes: CompiledNode[],
  edges: CompiledEdge[],
  enclosures: CompiledEnclosure[],
  report: Report,
) {
  const accented = [...nodes, ...edges, ...enclosures]
    .filter((element) => element.role === "accent" && !("passive" in element && element.passive))
    .map((element) => element.id);
  if (accented.length > 1)
    report(
      "ACCENT_OVERUSED",
      `${accented.join(", ")} all use the accent. Keep it on the one element that matters most.`,
      accented,
    );

  const rects = (n: CompiledNode) => (n.labelRect ? [n.rect, n.labelRect] : [n.rect]);
  const overlapOf = (a: CompiledNode, b: Rect) =>
    rects(a)
      .map((r) => overlap(r, b))
      .find(Boolean);

  for (let i = 0; i < nodes.length; i++)
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i] as CompiledNode;
      const b = nodes[j] as CompiledNode;
      if (a.passive || b.passive || (a.stepOnly && b.stepOnly)) continue;
      const marks = a.shape === "mark" && b.shape === "mark" && a.parent === b.parent;
      if ((a.parent || b.parent) && !marks) continue;
      const o = rects(b)
        .map((r) => overlapOf(a, r))
        .find(Boolean);
      if (o)
        report(
          "NODE_OVERLAP",
          `${a.id} and ${b.id} overlap by ${round(o.width)} × ${round(o.height)}.`,
          [a.id, b.id],
        );
    }

  const endOf = (p: PointLike) => {
    const el = elementOf(p);
    const ids = new Set(el ? [el.id] : []);
    if (el instanceof Node && el.member) ids.add(el.member.parent.id);
    return ids;
  };
  scene.edges.forEach((edge, k) => {
    const compiled = edges[k];
    if (!compiled || compiled.passive) return;
    const from = endOf(edge.from);
    const to = endOf(edge.to);
    const self = elementOf(edge.from) !== undefined && elementOf(edge.from) === elementOf(edge.to);
    const last = compiled.points.length - 2;
    for (const node of nodes) {
      if (node.shape === "mark" || node.passive) continue;
      if (compiled.stepOnly && node.stepOnly) continue;
      if (node.parent !== undefined) {
        const fromSibling = [edge.from, edge.to].some((p) => {
          const el = elementOf(p);
          return el instanceof Node && el.member?.parent.id === node.parent;
        });
        if (!fromSibling) continue;
      }
      const own = from.has(node.id) || to.has(node.id);
      const touches = (i: number) =>
        (own && (self || edge.bend !== 0)) ||
        (i === 0 && from.has(node.id)) ||
        (i === last && to.has(node.id));
      for (let i = 0; i < compiled.points.length - 1; i++) {
        const a = compiled.points[i] as Vec;
        const b = compiled.points[i + 1] as Vec;
        const hit = touches(i) ? (node.labelRect ? [node.labelRect] : []) : rects(node);
        if (hit.some((r) => segmentHitsRect(a, b, r))) {
          report(
            "EDGE_NODE_INTERSECTION",
            own && !touches(i)
              ? `${compiled.id} runs through its own end ${node.id}. Use a straight route or another route form.`
              : `${compiled.id} crosses ${node.id}. Route it (via, viaX, viaY), bend it, or move ${node.id}.`,
            [compiled.id, node.id],
          );
          break;
        }
      }
    }
  });

  const labels = edges.flatMap((e) => e.labels.map((l) => ({ edge: e, label: l })));
  for (const { edge, label } of labels) {
    for (const node of nodes) {
      if (node.passive || (edge.stepOnly && node.stepOnly)) continue;
      const o = overlapOf(node, label.rect);
      if (o)
        report(
          "LABEL_OVERLAP",
          `${edge.id} label "${textOf(label)}" intersects ${node.id} by ${round(o.width)} × ${round(o.height)}.`,
          [edge.id, node.id],
        );
    }
    for (const other of edges) {
      if (other === edge || other.passive || (other.stepOnly && edge.stepOnly)) continue;
      for (let i = 0; i < other.points.length - 1; i++)
        if (segmentHitsRect(other.points[i] as Vec, other.points[i + 1] as Vec, label.rect)) {
          report(
            "LABEL_OVERLAP",
            `${edge.id} label "${textOf(label)}" is crossed by ${other.id}.`,
            [edge.id, other.id],
          );
          break;
        }
    }
  }
  for (let i = 0; i < labels.length; i++)
    for (let j = i + 1; j < labels.length; j++) {
      const a = labels[i];
      const b = labels[j];
      if (a && b && !(a.edge.stepOnly && b.edge.stepOnly) && overlap(a.label.rect, b.label.rect))
        report(
          "LABEL_OVERLAP",
          `Labels "${textOf(a.label)}" (${a.edge.id}) and "${textOf(b.label)}" (${b.edge.id}) overlap.`,
          [a.edge.id, b.edge.id],
        );
    }

  for (const e of enclosures) {
    if (!e.titleRect) continue;
    for (const edge of edges)
      for (let i = 0; i < edge.points.length - 1; i++)
        if (
          segmentHitsRect(
            edge.points[i] as Vec,
            edge.points[i + 1] as Vec,
            inflate(e.titleRect, enclosure.titleClearance),
          )
        ) {
          report(
            "ENCLOSURE_TITLE_CROSSED",
            `${edge.id} crosses the title of ${e.id}. Move the title with titleAt, or move the edge.`,
            [edge.id, e.id],
          );
          break;
        }
  }

  scene.enclosures.forEach((e, k) => {
    const compiled = enclosures[k];
    if (!compiled) return;
    const members = new Set(memberIds(e));
    for (const node of nodes) {
      if (members.has(node.id) || node.passive) continue;
      if (node.parent !== undefined && members.has(node.parent)) continue;
      if (rects(node).some((r) => overlap(r, compiled.rect) && !contains(r, compiled.rect)))
        report(
          "ENCLOSURE_INTRUSION",
          `${node.id} is not a member of ${e.id} but overlaps its boundary.`,
          [node.id, e.id],
        );
    }
  });
}

/** How far apart two lines may be and still count as one. */
const collinear = 0.5;
/** The longest stretch two edges may share before they read as one line. */
const sharedLimit = 4;

/**
 * Report edges that share a stretch of line, compared on their routes before arrowheads cut them
 * back. A fork or a merge reads well: shared from the start or to the end, with both going on.
 */
export function checkOverlaps(edges: CompiledEdge[], routes: Vec[][], report: Report) {
  const boxes = routes.map((route) =>
    inflate(union(route.map((p) => ({ ...p, width: 0, height: 0 }))) ?? zero, collinear),
  );
  for (let i = 0; i < edges.length; i++)
    for (let j = i + 1; j < edges.length; j++) {
      const a = edges[i] as CompiledEdge;
      const b = edges[j] as CompiledEdge;
      if (a.passive || b.passive || (a.stepOnly && b.stepOnly)) continue;
      if (!touching(boxes[i] ?? zero, boxes[j] ?? zero)) continue;
      const shared = sharedStretch(routes[i] ?? [], routes[j] ?? []);
      if (shared > sharedLimit)
        report(
          "EDGE_OVERLAP",
          `${a.id} and ${b.id} run on top of each other for ${round(shared)} units, so they read as one line. Give one a bend, attach one at a port(), or draw one edge with ends: "<->".`,
          [a.id, b.id],
        );
    }
}

/** The longest stretch two routes share that is neither a fork nor a merge, or 0. */
function sharedStretch(a: Vec[], b: Vec[]): number {
  if (a.length < 2 || b.length < 2) return 0;
  const stretches: Array<{ length: number; onA: number[]; onB: number[] }> = [];
  let startA = 0;
  for (let i = 0; i < a.length - 1; i++) {
    const p = a[i] as Vec;
    const q = a[i + 1] as Vec;
    const legA = distance(p, q);
    const ux = (q.x - p.x) / (legA || 1);
    const uy = (q.y - p.y) / (legA || 1);
    const across = (v: Vec) => Math.abs((v.x - p.x) * uy - (v.y - p.y) * ux);
    const along = (v: Vec) => (v.x - p.x) * ux + (v.y - p.y) * uy;
    let startB = 0;
    for (let j = 0; j < b.length - 1; j++) {
      const r = b[j] as Vec;
      const t = b[j + 1] as Vec;
      const legB = distance(r, t);
      if (legA > 0 && legB > 0 && across(r) <= collinear && across(t) <= collinear) {
        const lo = Math.max(0, Math.min(along(r), along(t)));
        const hi = Math.min(legA, Math.max(along(r), along(t)));
        const onB = [startB + Math.abs(lo - along(r)), startB + Math.abs(hi - along(r))];
        if (hi - lo > sharedLimit)
          stretches.push({ length: hi - lo, onA: [startA + lo, startA + hi], onB });
      }
      startB += legB;
    }
    startA += legA;
  }
  if (stretches.length === 0) return 0;
  const lengthA = pathLength(a);
  const lengthB = pathLength(b);
  const parts = (common: number) =>
    common < Math.min(lengthA, lengthB) - collinear ? common + collinear : 0;
  const fork = parts(commonStart(a, b));
  const merge = parts(commonStart([...a].reverse(), [...b].reverse()));
  const shared = stretches.filter(
    ({ onA, onB }) =>
      !(Math.max(...onA, ...onB) <= fork) &&
      !(Math.min(...onA) >= lengthA - merge && Math.min(...onB) >= lengthB - merge),
  );
  return Math.max(0, ...shared.map((x) => x.length));
}

/** An empty rectangle at the origin, for a route with no points. */
const zero: Rect = { x: 0, y: 0, width: 0, height: 0 };

/** Whether two rectangles meet, edges included. */
function touching(a: Rect, b: Rect): boolean {
  return (
    a.x <= b.x + b.width && b.x <= a.x + a.width && a.y <= b.y + b.height && b.y <= a.y + a.height
  );
}

/** How far two routes run together from their first points, in the same direction. */
function commonStart(a: Vec[], b: Vec[]): number {
  if (distance(a[0] as Vec, b[0] as Vec) > collinear) return 0;
  const end = Math.min(pathLength(a), pathLength(b));
  const cuts = new Set<number>([end]);
  for (const route of [a, b]) {
    let at = 0;
    for (let i = 0; i < route.length - 1; i++) {
      at += distance(route[i] as Vec, route[i + 1] as Vec);
      if (at < end) cuts.add(at);
    }
  }
  let common = 0;
  for (const at of [...cuts].sort((x, y) => x - y)) {
    if (distance(pointAlong(a, at), pointAlong(b, at)) > collinear) return common;
    common = at;
  }
  return common;
}

/** The direct members of every container, by id. Steps expand them recursively. */
export function groupsOf(scene: DiagramBuilder): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  const add = (id: string, members: Array<{ id: string }>) => {
    groups[id] = [...(groups[id] ?? []), ...members.map((m) => m.id)];
  };
  for (const e of scene.enclosures) add(e.id, e.members);
  for (const s of scene.grids) add(s.id, s.children);
  for (const [container, members] of scene.groups) add(container.id, members);
  for (const node of scene.nodes) if (node.members.length) add(node.id, node.members);
  return groups;
}

/** The ids of an enclosure's members, with grids and nested enclosures expanded. */
function memberIds(e: Enclosure): string[] {
  const walk = (el: Element): string[] =>
    el instanceof Grid
      ? [el.id, ...el.children.flatMap(walk)]
      : el instanceof Enclosure
        ? [el.id, ...el.members.flatMap(walk)]
        : [el.id];
  return e.members.flatMap(walk);
}

/** An edge label on one line, as messages quote it. */
function textOf(label: CompiledLabel): string {
  return label.lines.map((l) => l.text).join(" ");
}
