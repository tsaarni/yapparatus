/**
 * Compilation: measure → size → place → route → label → validate → bounds.
 * Resolution is lazy and memoized, so declaration order never matters and
 * genuine dependency cycles are reported with their chain.
 */
import {
  anchorOf,
  boundaryToward,
  contains,
  distance,
  inflate,
  overlap,
  portOf,
  type Rect,
  round,
  segmentHitsRect,
  union,
  type Vec,
} from "./geometry.ts";
import {
  type Align,
  type Corner,
  type Diagnostic,
  type DiagramBuilder,
  type Edge,
  type Element,
  Enclosure,
  elementOf,
  type Frame,
  type LabelOptions,
  Node,
  type Placement,
  Point,
  type PointExpr,
  type PointLike,
  type Role,
  type Shape,
  type Side,
  Stack,
  slug,
  toExpr,
} from "./scene.ts";

/**
 * Categories a figure can color. Beyond four, readers with red-green color blindness can no
 * longer tell every pair apart, and everyone else must keep matching colors to the legend.
 */
export const maxCategories = 4;

/** A category in a figure's legend: its words, its color slot, and the parts that have it. */
export interface LegendEntry {
  name: string;
  /** For steps: `<Step focus="new">` focuses every part in the category "New". */
  id: string;
  /** 1 to maxCategories: which category color it has. */
  slot: number;
  parts: string[];
}

export interface FontSpec {
  family: string;
  size: number;
  weight: number;
}

/** Text measurement is injected: the browser uses canvas, tests use a fixed advance. */
export type Measure = (text: string, font: FontSpec) => number;

/**
 * Diagram type. Every text the compiler places gets one of these fonts, and the renderer
 * draws it with the font the compiler measured.
 */
export interface Metrics {
  /** For measurement. The renderer draws with the theme's font families. */
  sans: string;
  mono: string;
  /** Node labels. */
  labelSize: number;
  /** Everything else: sublabels, notes, record rows, edge labels, fragment titles. */
  smallSize: number;
  /** Enclosure titles and fragment operators, set in tabs. */
  tabSize: number;
  /** The interface's three weights: regular text, medium edge labels, semibold labels and tabs. */
  textWeight: number;
  edgeWeight: number;
  labelWeight: number;
  lineHeight: number;
  padX: number;
  padY: number;
  minWidth: number;
  minHeight: number;
  headLength: number;
  headWidth: number;
  margin: number;
}

export const defaultMetrics: Metrics = {
  sans: '"Inter Variable", sans-serif',
  mono: '"JetBrains Mono Variable", "SFMono-Regular", Menlo, monospace',
  labelSize: 13.5,
  smallSize: 12,
  tabSize: 11,
  textWeight: 400,
  edgeWeight: 500,
  labelWeight: 600,
  lineHeight: 1.38,
  padX: 16,
  padY: 11,
  minWidth: 104,
  minHeight: 46,
  headLength: 10,
  headWidth: 8,
  margin: 14,
};

export interface TextLine {
  text: string;
  x: number;
  y: number;
  size: number;
  weight: number;
  mono: boolean;
  muted: boolean;
  align: "middle" | "start";
}

export interface CompiledNode {
  id: string;
  explicitId: boolean;
  shape: Shape;
  role: Role;
  /** The category color slot, when the part has a category. */
  category?: number;
  label: string;
  rect: Rect;
  lines: TextLine[];
  passive: boolean;
  /** Shown only while a step focuses it. */
  stepOnly: boolean;
  /** A decoration's edge: steps show and fade it with that edge. */
  follows?: string;
  /** Record: y of the line under the title. */
  divider?: number;
  /** Start and end: the label beside the dot, outside its layout bounds. */
  labelRect?: Rect;
}

export interface CompiledFrame {
  id: string;
  rect: Rect;
  /** The operator, such as "loop", in a tab at the top-left corner. */
  tab?: { rect: Rect; line: TextLine };
  title?: TextLine;
  dividers: Array<{ y: number; label?: TextLine }>;
}

export interface CompiledLabel {
  text: string;
  rect: Rect;
  center: Vec;
  size: number;
  weight: number;
}

export interface CompiledEdge {
  id: string;
  explicitId: boolean;
  role: Role;
  /** The category color slot, when the part has a category. */
  category?: number;
  dashed: boolean;
  head: "filled" | "open";
  radius: number;
  passive: boolean;
  /** Shown only while a step focuses it. */
  stepOnly: boolean;
  points: Vec[];
  heads: Vec[][];
  labels: CompiledLabel[];
  ariaLabel: string;
}

export interface CompiledEnclosure {
  id: string;
  explicitId: boolean;
  role: Role;
  /** The category color slot, when the part has a category. */
  category?: number;
  rect: Rect;
  title?: TextLine;
  /** Painted area of the title tab, for collision checks. */
  titleRect?: Rect;
}

export interface CompiledDiagram {
  ok: boolean;
  viewBox: Rect;
  nodes: CompiledNode[];
  edges: CompiledEdge[];
  enclosures: CompiledEnclosure[];
  frames: CompiledFrame[];
  /** The categories, in color order. A legend under the drawing explains them. */
  legend: LegendEntry[];
  diagnostics: Diagnostic[];
  /** What a step focuses along with each container: enclosures, rows, columns, sequences. */
  groups: Record<string, string[]>;
}

class CycleError extends Error {
  readonly chain: string[];
  constructor(chain: string[]) {
    super(chain.join(" → "));
    this.chain = chain;
  }
}

interface Content {
  lines: Array<{
    text: string;
    width: number;
    size: number;
    weight: number;
    mono: boolean;
    muted: boolean;
  }>;
  width: number;
  height: number;
  /** Record: how many leading lines form the title. */
  titleLines: number;
}

/** Shape-specific measurements shared by sizing, layout, and anchors. */
const shapes = {
  actor: { figure: 30, gap: 6 },
  note: { padX: 12, padY: 9, fold: 10 },
  record: { padX: 14, padY: 8, row: 21 },
  dot: 16,
  ring: 20,
  /** Between a start or end dot and its label. */
  terminalGap: 8,
  bar: 10,
} as const;

export function compile(
  scene: DiagramBuilder,
  measure: Measure,
  metrics: Metrics = defaultMetrics,
): CompiledDiagram {
  const m = metrics;
  const tabFont = { family: m.sans, size: m.tabSize, weight: m.labelWeight };
  /** The color slot of a part's category, spread into its compiled form. */
  const categoryOf = (name: string | undefined) => {
    const index = name === undefined ? -1 : scene.categories.indexOf(name);
    return index >= 0 && index < maxCategories ? { category: index + 1 } : {};
  };
  const frameTitleFont = { family: m.sans, size: m.smallSize, weight: m.edgeWeight };
  const diagnostics: Diagnostic[] = [...scene.diagnostics];
  const warn = (code: string, message: string, ids: string[]) =>
    diagnostics.push({ code, severity: "warning", message, ids });
  const fail = (code: string, message: string, ids: string[]) =>
    diagnostics.push({ code, severity: "error", message, ids });

  checkIds(scene, fail);

  const known = new Set<Element>([...scene.nodes, ...scene.stacks, ...scene.enclosures]);
  const content = new Map<Node, Content>();
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

  function measureNode(node: Node): Content {
    const cached = content.get(node);
    if (cached) return cached;
    const o = node.options;
    const small = node.shape === "note" || node.shape === "text";
    const labelFont = {
      family: o.mono ? m.mono : m.sans,
      size: small ? m.smallSize : m.labelSize,
      weight: small ? m.textWeight : m.labelWeight,
    };
    const subFont = { family: m.sans, size: m.smallSize, weight: m.textWeight };
    const pad =
      node.shape === "text" ||
      node.shape === "actor" ||
      node.shape === "bar" ||
      node.shape === "dot" ||
      node.shape === "ring"
        ? 0
        : node.shape === "note"
          ? shapes.note.padX
          : m.padX;
    const wrapWidth = o.width !== undefined ? o.width - 2 * pad : Number.POSITIVE_INFINITY;
    const lines: Content["lines"] = [];
    const push = (text: string, font: FontSpec, muted: boolean) => {
      for (const paragraph of text.split("\n")) {
        for (const line of wrap(paragraph, font, wrapWidth, measure)) {
          lines.push({
            text: line,
            width: measure(line, font),
            size: font.size,
            weight: font.weight,
            mono: font.family === m.mono,
            muted,
          });
        }
      }
    };
    if (node.label) push(node.label, labelFont, false);
    if (o.sub) push(o.sub, subFont, true);
    const titleLines = lines.length;
    if (node.shape === "record")
      for (const row of node.rows)
        push(
          row,
          { family: o.mono ? m.mono : m.sans, size: m.smallSize, weight: m.textWeight },
          false,
        );
    const width = Math.max(0, ...lines.map((l) => l.width));
    const height = lines.reduce((sum, l) => sum + l.size * m.lineHeight, 0);
    const c = { lines, width, height, titleLines };
    content.set(node, c);
    if (lines.length && width > wrapWidth + 0.5)
      warn(
        "TEXT_OVERFLOW",
        `${node.id}: a word is ${round(width - wrapWidth)} units wider than the fixed width allows.`,
        [node.id],
      );
    return c;
  }

  function capHeight(node: Node, width: number) {
    return node.shape === "cylinder" ? cylinderCap(width) : 0;
  }

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
        const title = c.lines
          .slice(0, c.titleLines)
          .reduce((sum, l) => sum + l.size * m.lineHeight, 0);
        const rows = node.rows.length * shapes.record.row;
        return fixed(
          Math.max(c.width + 2 * shapes.record.padX, 140),
          title + 2 * shapes.record.padY + rows + (rows ? shapes.record.padY : 0),
        );
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
      warn(
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
      if (el instanceof Node) {
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

  /* ----- positions (top-left of layout bounds) ----- */

  const roots = [...scene.nodes, ...scene.stacks].filter((el) => !scene.owner.has(el));
  const firstRoot = roots[0];
  if (roots.length > 1)
    warn(
      "UNPLACED",
      `${roots
        .slice(1)
        .map((r) => r.id)
        .join(
          ", ",
        )} ${roots.length > 2 ? "have" : "has"} no position; placed at the origin over ${firstRoot?.id}. Add them to a row/column or place() them.`,
      roots.slice(1).map((r) => r.id),
    );

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
      case "row": {
        const r = bounds(e.el);
        const y = e.el instanceof Node ? recordRowY(e.el, r, e.index) : r.y + r.height / 2;
        return { x: e.side === "right" ? r.x + r.width : r.x, y };
      }
    }
  }

  function recordTitleBottom(node: Node, rect: Rect) {
    const c = measureNode(node);
    const title = c.lines.slice(0, c.titleLines).reduce((sum, l) => sum + l.size * m.lineHeight, 0);
    return rect.y + title + 2 * shapes.record.padY;
  }

  function recordRowY(node: Node, rect: Rect, index: number) {
    const rows = node.rows.length;
    if (index < 0 || index >= rows) {
      fail("RECORD_ROW", `${node.id} has ${rows} rows; row ${index} does not exist.`, [node.id]);
      return rect.y + rect.height / 2;
    }
    return (
      recordTitleBottom(node, rect) + shapes.record.padY / 2 + (index + 0.5) * shapes.record.row
    );
  }

  /* ----- resolve all elements ----- */

  let nodes: CompiledNode[] = [];
  let enclosures: CompiledEnclosure[] = [];
  let edges: CompiledEdge[] = [];
  let frames: CompiledFrame[] = [];
  try {
    nodes = scene.nodes.map((node) => compileNode(node, bounds(node)));
    for (const s of scene.stacks) bounds(s);
    enclosures = scene.enclosures.map((e) => {
      const rect = enclosureRect(e);
      return {
        id: e.id,
        explicitId: e.explicitId,
        role: e.options.role ?? "muted",
        ...categoryOf(e.options.category),
        rect,
        ...(e.options.title ? titleGeometry(e.options.title, rect, e.options.titleAt) : {}),
      };
    });
    edges = scene.edges.map(compileEdge);
    frames = scene.frames.map(compileFrame);
  } catch (error) {
    if (error instanceof CycleError) {
      fail(
        "PLACEMENT_CYCLE",
        `${error.chain.join(" → ")}. These placements depend on each other; anchor one of them independently.`,
        [...new Set(error.chain.map((k) => k.replace(/^\w+\((.*)\)$/, "$1")))],
      );
    } else {
      fail("COMPILE_ERROR", error instanceof Error ? error.message : String(error), []);
    }
    return finish(false);
  }

  function compileNode(node: Node, rect: Rect): CompiledNode {
    const c = measureNode(node);
    const line = (l: Content["lines"][number], x: number, y: number, align: TextLine["align"]) => ({
      text: l.text,
      x,
      y,
      size: l.size,
      weight: l.weight,
      mono: l.mono,
      muted: l.muted,
      align,
    });
    const stackLines = (
      list: Content["lines"],
      top: number,
      x: number,
      align: TextLine["align"],
    ) => {
      let y = top;
      return list.map((l) => {
        const lh = l.size * m.lineHeight;
        const out = line(l, x, y + lh / 2, align);
        y += lh;
        return out;
      });
    };
    const centerX = rect.x + rect.width / 2;
    let lines: TextLine[];
    let divider: number | undefined;
    const labelRect = terminalLabel(node, rect);
    switch (node.shape) {
      case "dot":
      case "ring":
        lines = labelRect
          ? node.options.side === undefined || node.options.side === "right"
            ? stackLines(c.lines, labelRect.y, labelRect.x, "start")
            : stackLines(c.lines, labelRect.y, labelRect.x + labelRect.width / 2, "middle")
          : [];
        break;
      case "actor":
        lines = stackLines(
          c.lines,
          rect.y + shapes.actor.figure + shapes.actor.gap,
          centerX,
          "middle",
        );
        break;
      case "note":
        lines = stackLines(c.lines, rect.y + shapes.note.padY, rect.x + shapes.note.padX, "start");
        break;
      case "record": {
        const title = c.lines.slice(0, c.titleLines);
        lines = stackLines(title, rect.y + shapes.record.padY, centerX, "middle");
        divider = recordTitleBottom(node, rect);
        node.rows.forEach((_row, i) => {
          const l = c.lines[c.titleLines + i];
          if (l)
            lines.push(line(l, rect.x + shapes.record.padX, recordRowY(node, rect, i), "start"));
        });
        break;
      }
      default: {
        const cap = capHeight(node, rect.width);
        lines = stackLines(
          c.lines,
          rect.y + rect.height / 2 + cap / 2 - c.height / 2,
          centerX,
          "middle",
        );
      }
    }
    return {
      id: node.id,
      explicitId: node.explicitId,
      shape: node.shape,
      role: node.options.role ?? "default",
      ...categoryOf(node.options.category),
      label: [node.label, node.options.sub].filter(Boolean).join(", "),
      rect,
      lines,
      passive: node.passive,
      stepOnly: node.options.stepOnly ?? false,
      ...(node.follows ? { follows: node.follows.id } : {}),
      ...(divider !== undefined ? { divider } : {}),
      ...(labelRect ? { labelRect } : {}),
    };
  }

  /** One line of text at a point, in a font the renderer draws as measured. */
  function textAt(text: string, x: number, y: number, font: FontSpec, muted = false): TextLine {
    return {
      text,
      x,
      y,
      size: font.size,
      weight: font.weight,
      mono: font.family === m.mono,
      muted,
      align: "start",
    };
  }

  function tabWidth(text: string) {
    return measure(text, tabFont) + 2 * tab.pad;
  }

  /** A title tab sitting on the border at one corner. */
  function titleGeometry(title: string, rect: Rect, corner: Corner = "topLeft") {
    const width = tabWidth(title);
    const x = corner.endsWith("Right") ? rect.x + rect.width - 14 - width : rect.x + 14;
    const y = corner.startsWith("bottom") ? rect.y + rect.height : rect.y;
    const titleRect = { x, y: y - tab.height / 2, width, height: tab.height };
    return { title: textAt(title, x + tab.pad, y, tabFont, true), titleRect };
  }

  /** A fragment's operator tab: text, padding, and a slanted lower-right corner. */
  function fragmentTab(text: string, x: number, y: number) {
    const width = measure(text, tabFont) + fragment.padX + fragment.slant + fragment.padX / 2;
    return {
      rect: { x, y, width, height: fragment.tabHeight },
      line: textAt(text, x + fragment.padX, y + fragment.textY, tabFont),
    };
  }

  function compileFrame(frame: Frame): CompiledFrame {
    const a = evalPoint(toExpr(frame.from));
    const b = evalPoint(toExpr(frame.to));
    const rect = {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      width: Math.abs(b.x - a.x),
      height: Math.abs(b.y - a.y),
    };
    const tabOf = frame.options.tab ? fragmentTab(frame.options.tab, rect.x, rect.y) : undefined;
    const titleX = rect.x + (tabOf ? tabOf.rect.width : 0) + fragment.padX;
    return {
      id: frame.id,
      rect,
      ...(tabOf ? { tab: tabOf } : {}),
      ...(frame.options.title
        ? {
            title: textAt(
              frame.options.title,
              titleX,
              rect.y + fragment.textY,
              frameTitleFont,
              true,
            ),
          }
        : {}),
      dividers: (frame.options.dividers ?? []).map((d) => {
        const y = evalPoint(toExpr(d.at)).y;
        return {
          y,
          ...(d.label
            ? {
                label: textAt(
                  d.label,
                  rect.x + fragment.padX,
                  y + fragment.textY + 1,
                  frameTitleFont,
                  true,
                ),
              }
            : {}),
        };
      }),
    };
  }

  /* ----- edges ----- */

  function compileEdge(edge: Edge): CompiledEdge {
    const fromEl = edge.from instanceof Point || Array.isArray(edge.from) ? undefined : edge.from;
    const toEl = edge.to instanceof Point || Array.isArray(edge.to) ? undefined : edge.to;
    let shape: { points: Vec[]; label: Partial<LabelOptions>; radius: number };
    if (fromEl && fromEl === toEl) shape = loop(bounds(fromEl), edge.loop);
    else if (edge.bend) {
      if (edge.route !== "straight")
        fail("BEND_WITH_ROUTE", `${edge.id} has both bend and route; use one of them.`, [edge.id]);
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
      fail("DEGENERATE_EDGE", `${edge.id} starts and ends at the same point.`, [edge.id]);
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
      fail(
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
      warn(
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

  function finish(ok: boolean): CompiledDiagram {
    const groups = groupsOf(scene);
    const parts = [...nodes, ...edges, ...enclosures];
    const legend = scene.categories.slice(0, maxCategories).map((name, i) => ({
      name,
      id: slug(name),
      slot: i + 1,
      parts: parts.filter((p) => p.category === i + 1).map((p) => p.id),
    }));
    // A category's id stands for its parts in steps, unless a part or container has that id.
    const taken = new Set([
      ...parts.map((p) => p.id),
      ...scene.stacks.map((s) => s.id),
      ...Object.keys(groups),
    ]);
    const categoryGroups: Record<string, string[]> = {};
    for (const entry of legend) {
      if (taken.has(entry.id))
        warn(
          "CATEGORY_ID_TAKEN",
          `The category "${entry.name}" has the id "${entry.id}", which a part already has, so steps cannot focus the category. Rename the category or the part.`,
          [entry.id],
        );
      else categoryGroups[entry.id] = entry.parts;
    }
    if (scene.categories.length > maxCategories)
      warn(
        "TOO_MANY_CATEGORIES",
        `This figure has ${scene.categories.length} categories; ${maxCategories} can be told apart by color. Parts in ${scene.categories
          .slice(maxCategories)
          .map((c) => `"${c}"`)
          .join(", ")} are drawn without a color. Merge categories, or split the figure.`,
        [],
      );
    const painted = union([
      ...nodes.flatMap((n) => (n.labelRect ? [n.rect, n.labelRect] : [n.rect])),
      ...enclosures.flatMap((e) => (e.titleRect ? [e.rect, e.titleRect] : [e.rect])),
      ...frames.map((f) => f.rect),
      ...edges.flatMap((e) => [
        ...e.labels.map((l) => l.rect),
        ...[...e.points, ...e.heads.flat()].map((p) => ({ ...p, width: 0, height: 0 })),
      ]),
    ]) ?? { x: 0, y: 0, width: 0, height: 0 };
    const viewBox = inflate(painted, m.margin);
    return {
      ok: ok && !diagnostics.some((d) => d.severity === "error"),
      viewBox: {
        x: Math.floor(viewBox.x),
        y: Math.floor(viewBox.y),
        width: Math.ceil(viewBox.width),
        height: Math.ceil(viewBox.height),
      },
      nodes,
      edges,
      enclosures,
      frames,
      legend,
      diagnostics,
      groups: { ...groups, ...categoryGroups },
    };
  }

  validate(scene, nodes, edges, enclosures, warn);
  return finish(true);
}

/* ---------- helpers ---------- */

/** Boundary title tabs. */
const tab = { height: 20, pad: 8 };
/** Sequence fragment tabs: the operator at the top-left, with a slanted corner. */
const fragment = { padX: 8, slant: 6, tabHeight: 19, textY: 10 };
/** Legs a curved edge is sampled into; even, so a vertex sits at the apex. */
const curveLegs = 16;
/** How far a self-loop reaches out from its node. */
const loopSize = 28;

function endpointName(p: PointLike): string {
  const el = elementOf(p);
  if (!el) return "a point";
  return el instanceof Node ? el.label || el.id : el.id;
}

/** Vertical radius of a cylinder's elliptical cap. */
export function cylinderCap(width: number): number {
  return Math.min(12, Math.max(6, width * 0.07));
}

function wrap(text: string, font: FontSpec, width: number, measure: Measure): string[] {
  if (!Number.isFinite(width) || measure(text, font) <= width) return [text];
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/)) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && measure(candidate, font) > width) {
      lines.push(current);
      current = word;
    } else current = candidate;
  }
  if (current) lines.push(current);
  return lines;
}

function dedupe(points: Vec[]): Vec[] {
  return points.filter((p, i) => i === 0 || distance(p, points[i - 1] as Vec) > 0.01);
}

function checkIds(scene: DiagramBuilder, fail: (c: string, m: string, ids: string[]) => void) {
  const all: Array<{ id: string; explicitId: boolean }> = [
    ...scene.nodes,
    ...scene.stacks,
    ...scene.enclosures,
    ...scene.edges,
  ];
  const taken = new Set<string>();
  for (const el of all.filter((e) => e.explicitId)) {
    if (taken.has(el.id)) fail("DUPLICATE_ID", `Two elements use id "${el.id}".`, [el.id]);
    taken.add(el.id);
  }
  // Derived IDs are conveniences, not identities: disambiguate them in declaration order.
  for (const el of all.filter((e) => !e.explicitId)) {
    const base = el.id;
    for (let n = 2; taken.has(el.id); n++) el.id = `${base}-${n}`;
    taken.add(el.id);
  }
}

function validate(
  scene: DiagramBuilder,
  nodes: CompiledNode[],
  edges: CompiledEdge[],
  enclosures: CompiledEnclosure[],
  warn: (c: string, m: string, ids: string[]) => void,
) {
  // The accent marks the one part that matters most; on two parts it marks neither.
  const accented = [...nodes, ...edges, ...enclosures]
    .filter((part) => part.role === "accent" && !("passive" in part && part.passive))
    .map((part) => part.id);
  if (accented.length > 1)
    warn(
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

  // Nodes overlapping each other.
  for (let i = 0; i < nodes.length; i++)
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i] as CompiledNode;
      const b = nodes[j] as CompiledNode;
      // Step-only parts may share a place; the steps decide whether they appear together.
      if (a.passive || b.passive || (a.stepOnly && b.stepOnly)) continue;
      const o = rects(b)
        .map((r) => overlapOf(a, r))
        .find(Boolean);
      if (o)
        warn(
          "NODE_OVERLAP",
          `${a.id} and ${b.id} overlap by ${round(o.width)} × ${round(o.height)}.`,
          [a.id, b.id],
        );
    }

  // Edges crossing nodes other than their own endpoints.
  const endpointsOf = (edge: Edge) =>
    new Set([edge.from, edge.to].flatMap((p) => elementOf(p)?.id ?? []));
  scene.edges.forEach((edge, k) => {
    const compiled = edges[k];
    if (!compiled || compiled.passive) return;
    const own = endpointsOf(edge);
    for (const node of nodes) {
      if (node.shape === "text" || node.passive) continue;
      if (compiled.stepOnly && node.stepOnly) continue;
      // An edge may meet its own endpoints, but not cross their labels.
      const hit = own.has(node.id) ? (node.labelRect ? [node.labelRect] : []) : rects(node);
      for (let i = 0; i < compiled.points.length - 1; i++) {
        const a = compiled.points[i] as Vec;
        const b = compiled.points[i + 1] as Vec;
        if (hit.some((r) => segmentHitsRect(a, b, r))) {
          warn(
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
        warn(
          "LABEL_OVERLAP",
          `${edge.id} label "${label.text}" intersects ${node.id} by ${round(o.width)} × ${round(o.height)}.`,
          [edge.id, node.id],
        );
    }
    for (const other of edges) {
      if (other === edge || other.passive || (other.stepOnly && edge.stepOnly)) continue;
      for (let i = 0; i < other.points.length - 1; i++)
        if (segmentHitsRect(other.points[i] as Vec, other.points[i + 1] as Vec, label.rect)) {
          warn("LABEL_OVERLAP", `${edge.id} label "${label.text}" is crossed by ${other.id}.`, [
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
        warn(
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
          warn(
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
      if (rects(node).some((r) => overlap(r, compiled.rect) && !contains(r, compiled.rect)))
        warn(
          "ENCLOSURE_INTRUSION",
          `${node.id} is not a member of ${e.id} but overlaps its boundary.`,
          [node.id, e.id],
        );
    }
  });
}

/** The direct members of every container, by id. Steps expand them recursively. */
function groupsOf(scene: DiagramBuilder): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  const add = (id: string, members: Array<{ id: string }>) => {
    groups[id] = [...(groups[id] ?? []), ...members.map((m) => m.id)];
  };
  for (const e of scene.enclosures) add(e.id, e.members);
  for (const s of scene.stacks) add(s.id, s.children);
  for (const [container, members] of scene.groups) add(container.id, members);
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
