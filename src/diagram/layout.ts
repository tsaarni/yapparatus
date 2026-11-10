/**
 * Layout: sizes from children up, positions from parents down, and points. Resolution is
 * lazy and memoized, so declaration order never matters; a real cycle is reported with its chain.
 */

import { anchorOf, portOf, type Rect, round, union, type Vec } from "./geometry.ts";
import { type Measure, type Metrics, shapes, tab } from "./metrics.ts";
import { createRecords } from "./records.ts";
import {
  type Align,
  type DiagramBuilder,
  type Element,
  Enclosure,
  Node,
  type Placement,
  type PointExpr,
  Stack,
  toExpr,
} from "./scene.ts";
import type { Report, Text } from "./text.ts";

/** A placement chain that depends on itself. */
export class CycleError extends Error {
  readonly chain: string[];
  constructor(chain: string[]) {
    super(chain.join(" → "));
    this.chain = chain;
  }
}

export type Layout = ReturnType<typeof createLayout>;

export function createLayout(
  scene: DiagramBuilder,
  m: Metrics,
  measure: Measure,
  report: Report,
  text: Text,
) {
  const { measureNode, capHeight, tabWidth } = text;
  // `bounds` is a hoisted function declaration, so records can call it once layout runs.
  const records = createRecords(m, measure, report, text, bounds);
  const { grid, member } = records;
  // Each result is computed once; `resolving` holds the chain being computed, to find cycles.
  const known = new Set<Element>([...scene.nodes, ...scene.stacks, ...scene.enclosures]);
  const sizes = new Map<Element, { width: number; height: number }>();
  const positions = new Map<Element, Vec>();
  const stackOffsets = new Map<Stack, Vec[]>();
  const enclosureRects = new Map<Enclosure, Rect>();
  const resolving: string[] = [];

  function guard<T>(key: string, fn: () => T): T {
    const i = resolving.indexOf(key);
    if (i >= 0) throw new CycleError([...resolving.slice(i), key]);
    resolving.push(key);
    try {
      return fn();
    } finally {
      resolving.pop();
    }
  }

  function requireKnown(el: Element) {
    if (!known.has(el)) throw new Error(`${el.id} belongs to a different diagram.`);
  }

  /* ----- sizes ----- */

  function intrinsicSize(node: Node) {
    const o = node.options;
    const c = measureNode(node);
    const fixed = (width: number, height: number) => ({
      width: o.width ?? Math.max(width, o.minWidth ?? 0),
      height: o.height ?? Math.max(height, o.minHeight ?? 0),
    });
    switch (node.shape) {
      case "dot":
        return fixed(shapes.dot, shapes.dot);
      case "ring":
        return fixed(shapes.ring, shapes.ring);
      case "bar":
        return fixed(shapes.bar, 0);
      case "actor":
        return fixed(Math.max(c.width, 36), shapes.actor.figure + shapes.actor.gap + c.height);
      case "note":
        return fixed(
          c.width + 2 * shapes.note.padX + shapes.note.fold / 2,
          c.height + 2 * shapes.note.padY,
        );
      case "diamond":
        return fixed(Math.max((c.width + 28) * 1.5, 80), Math.max((c.height + 14) * 1.7, 52));
      case "record": {
        const g = grid(node);
        return { width: g.width, height: g.height };
      }
    }
    const text = node.shape === "text";
    const padX = text ? 0 : m.padX;
    const padY = text ? 0 : m.padY;
    let width = o.width ?? Math.max(c.width + 2 * padX, text ? 0 : (o.minWidth ?? m.minWidth));
    if (o.minWidth !== undefined) width = Math.max(width, o.minWidth);
    const cap = capHeight(node, width);
    const needed = c.height + 2 * padY + 2 * cap;
    let height = o.height ?? Math.max(needed, text ? 0 : (o.minHeight ?? m.minHeight));
    if (o.minHeight !== undefined) height = Math.max(height, o.minHeight);
    if (o.height !== undefined && needed > o.height + 0.5)
      report(
        "TEXT_OVERFLOW",
        `${node.id}: content needs height ${round(needed)} but height is fixed at ${o.height}.`,
        [node.id],
      );
    return { width, height };
  }

  function size(el: Element): { width: number; height: number } {
    requireKnown(el);
    const cached = sizes.get(el);
    if (cached) return cached;
    return guard(`size(${el.id})`, () => {
      let s: { width: number; height: number };
      if (el instanceof Node && el.member) {
        const r = member(el).rect;
        s = { width: r.width, height: r.height };
      } else if (el instanceof Node) {
        s = intrinsicSize(el);
        for (const group of scene.sizeGroups) {
          if (!group.members.includes(el)) continue;
          const all = group.members.map(intrinsicSize);
          if (group.width) s = { ...s, width: Math.max(...all.map((a) => a.width)) };
          if (group.height) s = { ...s, height: Math.max(...all.map((a) => a.height)) };
        }
      } else if (el instanceof Stack) {
        const kids = el.children.map(size);
        const along = el.direction === "row" ? "width" : "height";
        const across = el.direction === "row" ? "height" : "width";
        const total =
          kids.reduce((sum, k) => sum + k[along], 0) + el.gap * Math.max(0, kids.length - 1);
        const cross = Math.max(0, ...kids.map((k) => k[across]));
        s =
          el.direction === "row"
            ? { width: total, height: cross }
            : { width: cross, height: total };
      } else if (el instanceof Enclosure) {
        const r = enclosureRect(el);
        s = { width: r.width, height: r.height };
      } else {
        throw new Error(`Unknown element ${el.id}`);
      }
      sizes.set(el, s);
      return s;
    });
  }

  /* ----- positions: the top-left of each layout box ----- */

  function position(el: Element): Vec {
    requireKnown(el);
    const cached = positions.get(el);
    if (cached) return cached;
    return guard(`position(${el.id})`, () => {
      let p: Vec;
      const owner = scene.owner.get(el);
      if (el instanceof Enclosure) {
        const r = enclosureRect(el);
        p = { x: r.x, y: r.y };
      } else if (el instanceof Node && el.member) {
        const r = member(el).rect;
        p = { x: r.x, y: r.y };
      } else if (owner instanceof Stack) {
        const base = position(owner);
        const offset = stackLayout(owner)[owner.children.indexOf(el)] ?? { x: 0, y: 0 };
        p = { x: base.x + offset.x, y: base.y + offset.y };
      } else if (owner) {
        p = placed(el, owner);
      } else {
        p = { x: 0, y: 0 };
      }
      positions.set(el, p);
      return p;
    });
  }

  function alignOffset(align: Align, space: number, own: number) {
    return align === "start" ? 0 : align === "end" ? space - own : (space - own) / 2;
  }

  function stackLayout(s: Stack): Vec[] {
    const cached = stackOffsets.get(s);
    if (cached) return cached;
    const total = size(s);
    let cursor = 0;
    const offsets = s.children.map((child) => {
      const k = size(child);
      let v: Vec;
      if (s.direction === "row") {
        v = { x: cursor, y: alignOffset(s.align, total.height, k.height) };
        cursor += k.width + s.gap;
      } else {
        v = { x: alignOffset(s.align, total.width, k.width), y: cursor };
        cursor += k.height + s.gap;
      }
      return v;
    });
    stackOffsets.set(s, offsets);
    return offsets;
  }

  function placed(el: Element, p: Placement): Vec {
    const s = size(el);
    if (p.kind === "at") {
      const target = evalPoint(toExpr(p.at));
      const local = anchorOf({ x: 0, y: 0, ...s }, p.anchor);
      return { x: target.x - local.x, y: target.y - local.y };
    }
    const r = bounds(p.ref);
    const vertical = p.dir === "below" || p.dir === "above";
    if (vertical) {
      const x = r.x + alignOffset(p.align, r.width, s.width);
      return { x, y: p.dir === "below" ? r.y + r.height + p.gap : r.y - p.gap - s.height };
    }
    const y = r.y + alignOffset(p.align, r.height, s.height);
    return { x: p.dir === "rightOf" ? r.x + r.width + p.gap : r.x - p.gap - s.width, y };
  }

  function bounds(el: Element): Rect {
    if (el instanceof Enclosure) return enclosureRect(el);
    return { ...position(el), ...size(el) };
  }

  /** Painted extent: layout bounds plus what is drawn outside them, such as a dot's label. */
  function ink(el: Element): Rect {
    const r = bounds(el);
    if (el instanceof Node) {
      const label = terminalLabel(el, r);
      return label ? (union([r, label]) as Rect) : r;
    }
    if (el instanceof Stack) return union([r, ...el.children.map(ink)]) as Rect;
    return r;
  }

  /** The label of a start or end dot sits beside it, on the chosen side. */
  function terminalLabel(node: Node, rect: Rect): Rect | undefined {
    if ((node.shape !== "dot" && node.shape !== "ring") || !node.label) return undefined;
    const c = measureNode(node);
    const gap = shapes.terminalGap;
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    switch (node.options.side ?? "right") {
      case "right":
        return {
          x: rect.x + rect.width + gap,
          y: cy - c.height / 2,
          width: c.width,
          height: c.height,
        };
      case "left":
        return {
          x: rect.x - gap - c.width,
          y: cy - c.height / 2,
          width: c.width,
          height: c.height,
        };
      case "above":
        return {
          x: cx - c.width / 2,
          y: rect.y - gap - c.height,
          width: c.width,
          height: c.height,
        };
      case "below":
        return {
          x: cx - c.width / 2,
          y: rect.y + rect.height + gap,
          width: c.width,
          height: c.height,
        };
    }
  }

  function enclosureRect(e: Enclosure): Rect {
    const cached = enclosureRects.get(e);
    if (cached) return cached;
    return guard(`bounds(${e.id})`, () => {
      const inner = union(e.members.map(ink)) ?? { x: 0, y: 0, width: 0, height: 0 };
      const pad = e.options.padding ?? 20;
      // The title is a tab on the border; half of it reaches inside.
      const titleBand = e.options.title ? tab.height / 2 + 4 : 0;
      const titleWidth = e.options.title ? tabWidth(e.options.title) + 28 : 0;
      const width = Math.max(inner.width + 2 * pad, titleWidth);
      const r = {
        x: inner.x + inner.width / 2 - width / 2,
        y: inner.y - pad - (e.options.titleAt?.startsWith("bottom") ? 0 : titleBand),
        width,
        height: inner.height + 2 * pad + titleBand,
      };
      enclosureRects.set(e, r);
      return r;
    });
  }

  /* ----- points ----- */

  function evalPoint(e: PointExpr): Vec {
    switch (e.k) {
      case "abs":
        return { x: e.x, y: e.y };
      case "anchor":
        return anchorOf(bounds(e.el), e.name);
      case "port":
        return portOf(bounds(e.el), e.side, e.t);
      case "offset": {
        const b = evalPoint(e.base);
        return { x: b.x + e.dx, y: b.y + e.dy };
      }
      case "xy":
        return { x: evalPoint(e.x).x, y: evalPoint(e.y).y };
      case "lerp": {
        const a = evalPoint(e.a);
        const b = evalPoint(e.b);
        return { x: a.x + (b.x - a.x) * e.t, y: a.y + (b.y - a.y) * e.t };
      }
    }
  }

  return { bounds, terminalLabel, enclosureRect, evalPoint, ...records };
}
