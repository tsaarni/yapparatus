/**
 * Layout: sizes from children up, positions from parents down, and points. Resolution is
 * lazy and memoized, so declaration order never matters; a real cycle is reported with its chain.
 */

import type { DiagramBuilder } from "../builder.ts";
import {
  type Align,
  type Element,
  Enclosure,
  Grid,
  Node,
  type Placement,
  type PointExpr,
  toExpr,
} from "../elements.ts";
import { anchorOf, portOf, type Rect, round, union, type Vec } from "../geometry.ts";
import { type Measure, type Metrics, shapes, tab } from "../metrics.ts";
import { room, stackRoom } from "../outlines.ts";
import { createRecords } from "./records.ts";
import type { Report, Text } from "./text.ts";

/** A placement chain that depends on itself. */
export class CycleError extends Error {
  readonly chain: string[];
  constructor(chain: string[]) {
    super(chain.join(" → "));
    this.chain = chain;
  }
}

/** A grid's tracks: their sizes, where each starts in the grid, and the grid's size. */
interface Tracks {
  widths: number[];
  heights: number[];
  xs: number[];
  ys: number[];
  width: number;
  height: number;
}

/** Where each track starts: after the tracks before it, one gap apart. */
function starts(lengths: number[], gap: number): number[] {
  let cursor = 0;
  return lengths.map((length) => {
    const start = cursor;
    cursor += length + gap;
    return start;
  });
}

/** The length of tracks in a line: their sum and the gaps between them. */
function span(lengths: number[], gap: number): number {
  return lengths.reduce((sum, length) => sum + length, 0) + gap * Math.max(0, lengths.length - 1);
}

/** The layout functions the node and edge compilers read positions and sizes from. */
export type Layout = ReturnType<typeof createLayout>;

/** Lay out a scene: memoized sizes, positions, and points that resolve on first use. */
export function createLayout(
  scene: DiagramBuilder,
  m: Metrics,
  measure: Measure,
  report: Report,
  text: Text,
) {
  const { measureNode, tabWidth } = text;
  const records = createRecords(m, measure, report, text, bounds);
  const { grid, member } = records;
  const known = new Set<Element>([...scene.nodes, ...scene.grids, ...scene.enclosures]);
  const intrinsicSizes = new Map<Node, { width: number; height: number }>();
  const sizes = new Map<Element, { width: number; height: number }>();
  const positions = new Map<Element, Vec>();
  const gridTracks = new Map<Grid, Tracks>();
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

  function intrinsicSize(node: Node) {
    const cached = intrinsicSizes.get(node);
    if (cached) return cached;
    const s = contentSize(node);
    intrinsicSizes.set(node, s);
    return s;
  }

  function contentSize(node: Node) {
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
    const pad = { width: text ? 0 : m.padX, height: text ? 0 : m.padY };
    const least = { width: o.minWidth, height: o.minHeight };
    const floor = {
      width: text ? 0 : (o.minWidth ?? m.minWidth),
      height: text ? 0 : (o.minHeight ?? m.minHeight),
    };
    const fit = (needed: number, axis: "width" | "height") =>
      Math.max(o[axis] ?? Math.max(needed, floor[axis]), least[axis] ?? 0);
    const base = { width: c.width + 2 * pad.width, height: c.height + 2 * pad.height };
    const outline = room(node.shape, {
      width: fit(base.width, "width"),
      height: fit(base.height, "height"),
    });
    const width = fit(base.width + outline.width, "width");
    const needed = base.height + outline.height;
    const height = fit(needed, "height");
    if (o.height !== undefined && needed > o.height + 0.5)
      report(
        "TEXT_OVERFLOW",
        `${node.id}: content needs height ${round(needed)} but height is fixed at ${o.height}.`,
        [node.id],
      );
    const stacked = stackRoom(o.replicas);
    return { width: width + stacked, height: height + stacked };
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
          if (group.width) s = { ...s, width: grouped(el, "width", all) };
          if (group.height) s = { ...s, height: grouped(el, "height", all) };
        }
      } else if (el instanceof Grid) {
        const t = tracks(el);
        s = { width: t.width, height: t.height };
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

  function grouped(
    node: Node,
    axis: "width" | "height",
    all: Array<{ width: number; height: number }>,
  ) {
    const largest = Math.max(...all.map((a) => a[axis]));
    const own = node.options[axis];
    if (own === undefined) return largest;
    const fixed = own + stackRoom(node.options.replicas);
    if (fixed < largest - 0.5)
      report(
        "FIXED_SIZE_IN_GROUP",
        `${node.id} has a fixed ${axis} of ${round(own)}, but its size group is ${round(largest)}. Remove the fixed size or take the element out of the group.`,
        [node.id],
      );
    return fixed;
  }

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
      } else if (owner instanceof Grid) {
        const base = position(owner);
        const offset = cellOffset(owner, el);
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

  function tracks(g: Grid): Tracks {
    const cached = gridTracks.get(g);
    if (cached) return cached;
    const cellSize = (cell: Element | null) => (cell ? size(cell) : { width: 0, height: 0 });
    const widths = Array.from({ length: g.columnCount }, (_, c) =>
      Math.max(0, ...g.rows.map((row) => cellSize(row[c] ?? null).width)),
    );
    const heights = g.rows.map((row) => Math.max(0, ...row.map((cell) => cellSize(cell).height)));
    const t = {
      widths,
      heights,
      xs: starts(widths, g.gap.x),
      ys: starts(heights, g.gap.y),
      width: span(widths, g.gap.x),
      height: span(heights, g.gap.y),
    };
    gridTracks.set(g, t);
    return t;
  }

  function cellOffset(g: Grid, el: Element): Vec {
    const t = tracks(g);
    const r = g.rows.findIndex((row) => row.includes(el));
    const c = g.rows[r]?.indexOf(el) ?? -1;
    const s = size(el);
    return {
      x: (t.xs[c] ?? 0) + alignOffset(g.align.x, t.widths[c] ?? 0, s.width),
      y: (t.ys[r] ?? 0) + alignOffset(g.align.y, t.heights[r] ?? 0, s.height),
    };
  }

  function gutter(g: Grid, axis: "x" | "y", index: number): Vec {
    const t = tracks(g);
    const r = bounds(g);
    const center = anchorOf(r, "center");
    return axis === "x"
      ? { x: r.x + (t.xs[index] ?? 0) + (t.widths[index] ?? 0) + g.gap.x / 2, y: center.y }
      : { x: center.x, y: r.y + (t.ys[index] ?? 0) + (t.heights[index] ?? 0) + g.gap.y / 2 };
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

  function ink(el: Element): Rect {
    const r = bounds(el);
    if (el instanceof Node) {
      const label = terminalLabel(el, r);
      return label ? (union([r, label]) as Rect) : r;
    }
    if (el instanceof Grid) return union([r, ...el.children.map(ink)]) as Rect;
    return r;
  }

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
      case "gutter":
        return gutter(e.grid, e.axis, e.index);
    }
  }

  return { bounds, terminalLabel, enclosureRect, evalPoint, ...records };
}
