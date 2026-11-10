/**
 * Checks over the scene and the compiled drawing: ids, positions, overlaps, crossings.
 */
import type { CompiledEdge, CompiledEnclosure, CompiledNode } from "./compiled.ts";
import {
  contains,
  inflate,
  overlap,
  type Rect,
  round,
  segmentHitsRect,
  type Vec,
} from "./geometry.ts";
import {
  type DiagramBuilder,
  type Edge,
  type Element,
  Enclosure,
  elementOf,
  Node,
  Stack,
} from "./scene.ts";
import type { Report } from "./text.ts";

/**
 * Settle ids in dependency order: shapes and containers first, then members, whose ids
 * start with their parent's, then edges, whose derived ids join the ids of their ends.
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
  settle([...scene.nodes.filter((n) => !n.member), ...scene.stacks, ...scene.enclosures]);
  // Own ids are unique in their parent, and parents' ids are now unique.
  for (const m of members) if (m.member) m.id = `${m.member.parent.id}.${m.member.own}`;
  settle(members.map((m) => ({ id: m.id, explicitId: true })));
  for (const edge of scene.edges) edge.deriveId();
  settle(scene.edges);
}

/** Every element needs a position owner; all but the first without one are reported. */
export function checkPlaced(scene: DiagramBuilder, report: Report) {
  const roots = [...scene.nodes, ...scene.stacks].filter(
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

export function validate(
  scene: DiagramBuilder,
  nodes: CompiledNode[],
  edges: CompiledEdge[],
  enclosures: CompiledEnclosure[],
  report: Report,
) {
  // The accent marks the one part that matters most; on two parts it marks neither.
  const accented = [...nodes, ...edges, ...enclosures]
    .filter((part) => part.role === "accent" && !("passive" in part && part.passive))
    .map((part) => part.id);
  if (accented.length > 1)
    report(
      "ACCENT_OVERUSED",
      `${accented.join(", ")} all use the accent. Keep it on the one part that matters most.`,
      accented,
    );

  // A start or end label is painted outside the dot, so it takes part in every check.
  const rects = (n: CompiledNode) => (n.labelRect ? [n.rect, n.labelRect] : [n.rect]);
  const overlapOf = (a: CompiledNode, b: Rect) =>
    rects(a)
      .map((r) => overlap(r, b))
      .find(Boolean);

  // Nodes overlapping each other. Members lie inside their parent, which is checked for them.
  for (let i = 0; i < nodes.length; i++)
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i] as CompiledNode;
      const b = nodes[j] as CompiledNode;
      // Step-only parts may share a place; the steps decide whether they appear together.
      if (a.passive || b.passive || (a.stepOnly && b.stepOnly)) continue;
      // Of members, only marks of one text can collide: two highlights over the same letters.
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

  // Edges crossing nodes other than their own endpoints. A member's edge leaves through its
  // parent, and an edge of a record or text may cross its own members.
  const endpointsOf = (edge: Edge) => {
    const ends = [edge.from, edge.to].flatMap((p) => elementOf(p) ?? []);
    const own = new Set(ends.map((e) => e.id));
    for (const e of ends) if (e instanceof Node && e.member) own.add(e.member.parent.id);
    return own;
  };
  scene.edges.forEach((edge, k) => {
    const compiled = edges[k];
    if (!compiled || compiled.passive) return;
    const own = endpointsOf(edge);
    for (const node of nodes) {
      if (node.shape === "text" || node.shape === "mark" || node.passive) continue;
      if (compiled.stepOnly && node.stepOnly) continue;
      if (node.parent !== undefined) {
        // A member is checked only for edges of its own parent: from a sibling cell, across
        // this one. Any other edge that crosses it crosses its parent, which is reported.
        const fromSibling = [edge.from, edge.to].some((p) => {
          const el = elementOf(p);
          return el instanceof Node && el.member?.parent.id === node.parent;
        });
        if (!fromSibling) continue;
      }
      // An edge may meet its own endpoints, but not cross their labels.
      const hit = own.has(node.id) ? (node.labelRect ? [node.labelRect] : []) : rects(node);
      for (let i = 0; i < compiled.points.length - 1; i++) {
        const a = compiled.points[i] as Vec;
        const b = compiled.points[i + 1] as Vec;
        if (hit.some((r) => segmentHitsRect(a, b, r))) {
          report(
            "EDGE_NODE_INTERSECTION",
            `${compiled.id} crosses ${node.id}. Route it (via, viaX, viaY), bend it, or move ${node.id}.`,
            [compiled.id, node.id],
          );
          break;
        }
      }
    }
  });

  // Labels against nodes, other labels, and other edges.
  const labels = edges.flatMap((e) => e.labels.map((l) => ({ edge: e, label: l })));
  for (const { edge, label } of labels) {
    for (const node of nodes) {
      if (node.passive || (edge.stepOnly && node.stepOnly)) continue;
      const o = overlapOf(node, label.rect);
      if (o)
        report(
          "LABEL_OVERLAP",
          `${edge.id} label "${label.text}" intersects ${node.id} by ${round(o.width)} × ${round(o.height)}.`,
          [edge.id, node.id],
        );
    }
    for (const other of edges) {
      if (other === edge || other.passive || (other.stepOnly && edge.stepOnly)) continue;
      for (let i = 0; i < other.points.length - 1; i++)
        if (segmentHitsRect(other.points[i] as Vec, other.points[i + 1] as Vec, label.rect)) {
          report("LABEL_OVERLAP", `${edge.id} label "${label.text}" is crossed by ${other.id}.`, [
            edge.id,
            other.id,
          ]);
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
          `Labels "${a.label.text}" (${a.edge.id}) and "${b.label.text}" (${b.edge.id}) overlap.`,
          [a.edge.id, b.edge.id],
        );
    }

  // Edges running through enclosure titles.
  for (const e of enclosures) {
    if (!e.titleRect) continue;
    for (const edge of edges)
      for (let i = 0; i < edge.points.length - 1; i++)
        // Keep a little clearance: a line touching the text reads as crossing it.
        if (
          segmentHitsRect(edge.points[i] as Vec, edge.points[i + 1] as Vec, inflate(e.titleRect, 8))
        ) {
          report(
            "ENCLOSURE_TITLE_CROSSED",
            `${edge.id} crosses the title of ${e.id}. Move the title with titleAt, or move the edge.`,
            [edge.id, e.id],
          );
          break;
        }
  }

  // Non-members intruding into an enclosure.
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

/** The direct members of every container, by id. Steps expand them recursively. */
export function groupsOf(scene: DiagramBuilder): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  const add = (id: string, members: Array<{ id: string }>) => {
    groups[id] = [...(groups[id] ?? []), ...members.map((m) => m.id)];
  };
  for (const e of scene.enclosures) add(e.id, e.members);
  for (const s of scene.stacks) add(s.id, s.children);
  for (const [container, members] of scene.groups) add(container.id, members);
  for (const node of scene.nodes) if (node.members.length) add(node.id, node.members);
  return groups;
}

function memberIds(e: Enclosure): string[] {
  const walk = (el: Element): string[] =>
    el instanceof Stack
      ? [el.id, ...el.children.flatMap(walk)]
      : el instanceof Enclosure
        ? [el.id, ...el.members.flatMap(walk)]
        : [el.id];
  return e.members.flatMap(walk);
}
