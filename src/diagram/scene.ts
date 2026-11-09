/**
 * Authoring API: a retained scene of handles and relationships.
 * Nothing is measured or positioned here; `compile` resolves geometry later.
 */
import type { DiagnosticCode } from "../protocol.ts";
import type { AnchorName, Side } from "./geometry.ts";
import { type SequenceOptions, type SequenceStep, sequence } from "./sequence.ts";

export type { AnchorName, Side };

/** What a part is for: the one to look at, a risk, a quiet part, or one outside the system. */
export type Role = "default" | "accent" | "muted" | "warning" | "external";
export type Align = "start" | "center" | "end";
export type Corner = "topLeft" | "topRight" | "bottomLeft" | "bottomRight";

/** A problem in a diagram. Its severity is its code's, in `diagnosticCodes`. */
export interface Diagnostic {
  code: DiagnosticCode;
  message: string;
  /** The parts it is about, which also identify it. */
  ids: string[];
  /** What it is about when no part is, such as a step's id. */
  subject?: string;
}

/* ---------- Points ---------- */

export type PointExpr =
  | { k: "anchor"; el: Element; name: AnchorName }
  | { k: "port"; el: Element; side: Side; t: number }
  | { k: "abs"; x: number; y: number }
  | { k: "offset"; base: PointExpr; dx: number; dy: number }
  | { k: "xy"; x: PointExpr; y: PointExpr }
  | { k: "lerp"; a: PointExpr; b: PointExpr; t: number }
  | { k: "row"; el: Element; index: number; side: "left" | "right" };

/** A lazily resolved point. Coordinates are known only after compilation. */
export class Point {
  readonly expr: PointExpr;
  constructor(expr: PointExpr) {
    this.expr = expr;
  }
  /** Shift by dx rightward and dy downward. */
  offset(dx: number, dy: number): Point {
    return new Point({ k: "offset", base: this.expr, dx, dy });
  }
}

export type PointLike = Point | Element | [number, number];

/* ---------- Elements ---------- */

abstract class Element {
  /** Explicit ids are fixed; derived ids get a numeric suffix when they collide. */
  id: string;
  /** True when the author supplied the id; derived ids may change with labels. */
  readonly explicitId: boolean;
  constructor(id: string, explicit: boolean) {
    this.id = id;
    this.explicitId = explicit;
  }
  private a(name: AnchorName) {
    return new Point({ k: "anchor", el: this, name });
  }
  get center() {
    return this.a("center");
  }
  get top() {
    return this.a("top");
  }
  get bottom() {
    return this.a("bottom");
  }
  get left() {
    return this.a("left");
  }
  get right() {
    return this.a("right");
  }
  get topLeft() {
    return this.a("topLeft");
  }
  get topRight() {
    return this.a("topRight");
  }
  get bottomLeft() {
    return this.a("bottomLeft");
  }
  get bottomRight() {
    return this.a("bottomRight");
  }
  /** A point on one side: `t` runs 0→1 left→right on top and bottom, top→bottom on the sides. */
  port(side: Side, t = 0.5): Point {
    return new Point({ k: "port", el: this, side, t });
  }
}

export type { Element };

export type Shape =
  | "box"
  | "cylinder"
  | "text"
  | "actor"
  | "note"
  | "diamond"
  | "dot"
  | "ring"
  | "record"
  /** Internal: activation bars in sequence diagrams. */
  | "bar"
  /** Internal: empty space that reserves room, such as under a sequence's lifelines. */
  | "space";

export interface NodeOptions {
  /** Stable identity for links, steps, and diagnostics. Default: derived from the label. */
  id?: string;
  /** Secondary line in smaller, muted text. */
  sub?: string;
  role?: Role;
  /**
   * What sets this part apart, in a few words, such as "New" or "To be removed". Parts with
   * the same category share a color, and a legend under the figure explains each color.
   */
  category?: string;
  /** Fixed width; text wraps inside it. Default: fit content. */
  width?: number;
  /** Fixed height. Overflowing content is reported, never shrunk. */
  height?: number;
  minWidth?: number;
  minHeight?: number;
  /** Render the label in monospace. */
  mono?: boolean;
  /** Show only while a step focuses it: a callout, or one version of a changing label. */
  stepOnly?: boolean;
}

/** Options for `start()` and `end()`. Their size is fixed, so they take no size options. */
export interface TerminalOptions
  extends Pick<NodeOptions, "id" | "sub" | "role" | "category" | "stepOnly"> {
  /** Where the label sits next to the dot. Default: right. */
  side?: LabelSide;
}

/** What the library sets on nodes it draws itself; not part of the authoring API. */
export interface NodeInternals {
  /** A derived id that is not the label's slug, such as `start-1`. */
  id?: string;
  /** Record rows, shown under the title. */
  rows?: string[];
  /** Decoration only: excluded from overlap and crossing checks, never interactive. */
  passive?: boolean;
  /** A decoration that steps show and fade with this edge, such as an activation bar. */
  follows?: Edge;
}

export class Node extends Element {
  readonly shape: Shape;
  readonly label: string;
  readonly options: NodeOptions & Pick<TerminalOptions, "side">;
  readonly rows: string[];
  readonly passive: boolean;
  readonly follows: Edge | undefined;
  constructor(
    shape: Shape,
    label: string,
    options: NodeOptions & Pick<TerminalOptions, "side">,
    internals: NodeInternals = {},
  ) {
    super(options.id ?? internals.id ?? slug(label), options.id !== undefined);
    this.shape = shape;
    this.label = label;
    this.options = options;
    this.rows = internals.rows ?? [];
    this.passive = internals.passive ?? false;
    this.follows = internals.follows;
  }
  /** A point on the left or right edge of a record row. */
  row(index: number, side: "left" | "right" = "right"): Point {
    return new Point({ k: "row", el: this, index, side });
  }
}

export interface StackOptions {
  id?: string;
  gap?: number;
  align?: Align;
}

/** A row or column. It owns the positions of its children and is itself placeable. */
export class Stack extends Element {
  readonly direction: "row" | "column";
  readonly children: Element[];
  readonly gap: number;
  readonly align: Align;
  constructor(direction: "row" | "column", children: Element[], options: StackOptions, n: number) {
    super(options.id ?? `${direction}-${n}`, options.id !== undefined);
    this.direction = direction;
    this.children = children;
    this.gap = options.gap ?? (direction === "row" ? 88 : 64);
    this.align = options.align ?? "center";
  }
}

export interface EncloseOptions {
  id?: string;
  title?: string;
  /** The corner that holds the title. Default: topLeft. */
  titleAt?: Corner;
  padding?: number;
  role?: Role;
  /**
   * What sets this part apart, in a few words, such as "New" or "To be removed". Parts with
   * the same category share a color, and a legend under the figure explains each color.
   */
  category?: string;
}

/** A boundary drawn around elements positioned elsewhere. It never moves them. */
export class Enclosure extends Element {
  readonly members: Element[];
  readonly options: EncloseOptions;
  constructor(members: Element[], options: EncloseOptions, n: number) {
    super(options.id ?? (options.title ? slug(options.title) : `boundary-${n}`), !!options.id);
    this.members = members;
    this.options = options;
  }
}

/* ---------- Edges ---------- */

export type Route =
  | "straight"
  /** Horizontal first leg, then vertical. */
  | "hv"
  /** Vertical first leg, then horizontal. */
  | "vh"
  | { via: PointLike[] }
  /** Horizontal, then vertical along this x, then horizontal. */
  | { viaX: number | Point }
  /** Vertical, then horizontal along this y, then vertical. */
  | { viaY: number | Point };

export type LabelSide = "above" | "below" | "left" | "right";

export interface LabelOptions {
  text: string;
  /** Zero-based leg of the route. Default: the longest leg. */
  segment?: number;
  /** Position along that leg, 0→1. Default: 0.5. */
  at?: number;
  /** Default: above horizontal legs, right of vertical legs, outside curves and loops. */
  side?: LabelSide;
  gap?: number;
}

export type Ends = "->" | "<-" | "<->" | "--";

export interface EdgeOptions {
  id?: string;
  label?: string | LabelOptions;
  route?: Route;
  /** Curve a straight edge this many units to its left, seen in the direction of travel. */
  bend?: number;
  /** The side a self-loop (`d.arrow(a, a)`) leaves from. Default: right. */
  loop?: Side;
  role?: Role;
  /**
   * What sets this part apart, in a few words, such as "New" or "To be removed". Parts with
   * the same category share a color, and a legend under the figure explains each color.
   */
  category?: string;
  dashed?: boolean;
  ends?: Ends;
  /** Arrowhead style: "filled" (default) for calls and flows, "open" for replies and async. */
  head?: "filled" | "open";
  /** Show only while a step focuses it, such as a message that comes and goes. */
  stepOnly?: boolean;
}

/** What the library sets on edges it draws itself; not part of the authoring API. */
export interface EdgeInternals {
  /** Decoration only, such as a lifeline: drawn underneath and excluded from checks. */
  passive?: boolean;
  /** The id to use when the author gives none. Default: `<from>-><to>`. */
  derivedId?: string;
}

export class Edge {
  /** Explicit ids are fixed; derived ids get a numeric suffix when they collide. */
  id: string;
  readonly explicitId: boolean;
  readonly from: PointLike;
  readonly to: PointLike;
  readonly route: Route;
  readonly bend: number;
  readonly loop: Side;
  readonly role: Role;
  readonly category: string | undefined;
  readonly dashed: boolean;
  readonly ends: Ends;
  readonly head: "filled" | "open";
  readonly passive: boolean;
  readonly stepOnly: boolean;
  readonly labels: LabelOptions[] = [];
  constructor(from: PointLike, to: PointLike, options: EdgeOptions, internals: EdgeInternals = {}) {
    this.id = options.id ?? internals.derivedId ?? `${refName(from)}->${refName(to)}`;
    this.explicitId = options.id !== undefined;
    this.from = from;
    this.to = to;
    this.route = options.route ?? "straight";
    this.bend = options.bend ?? 0;
    this.loop = options.loop ?? "right";
    this.role = options.role ?? "default";
    this.category = options.category;
    this.dashed = options.dashed ?? false;
    this.ends = options.ends ?? "->";
    this.head = options.head ?? "filled";
    this.passive = internals.passive ?? false;
    this.stepOnly = options.stepOnly ?? false;
    if (options.label) this.label(options.label);
  }
  /** Add a label. An edge can have several. */
  label(label: string | LabelOptions): this {
    this.labels.push(typeof label === "string" ? { text: label } : label);
    return this;
  }
}

/* ---------- Frames ---------- */

export interface FrameOptions {
  id?: string;
  /** Tab label in the top-left corner, such as "alt" or "loop". */
  tab?: string;
  /** Text after the tab, such as a guard condition. */
  title?: string;
  /** Dashed horizontal dividers, each with an optional label, at these points' y. */
  dividers?: Array<{ at: PointLike; label?: string }>;
}

/** A titled region between two corner points. It neither owns nor moves anything. */
export class Frame {
  readonly id: string;
  readonly from: PointLike;
  readonly to: PointLike;
  readonly options: FrameOptions;
  constructor(from: PointLike, to: PointLike, options: FrameOptions, n: number) {
    this.id = options.id ?? `frame-${n}`;
    this.from = from;
    this.to = to;
    this.options = options;
  }
}

/* ---------- Placement ---------- */

export type Placement =
  | {
      kind: "relative";
      dir: "below" | "above" | "leftOf" | "rightOf";
      ref: Element;
      gap: number;
      align: Align;
    }
  | { kind: "at"; at: PointLike; anchor: AnchorName };

export interface PlaceOptions {
  below?: Element;
  above?: Element;
  leftOf?: Element;
  rightOf?: Element;
  /** Boundary-to-boundary distance. Default: 64 vertically, 88 horizontally. */
  gap?: number;
  /** Cross-axis alignment with the reference. Default: center. */
  align?: Align;
  /** Put the element's `anchor` (default: center) at this point. */
  at?: PointLike;
  anchor?: AnchorName;
}

/* ---------- Builder ---------- */

export class DiagramBuilder {
  readonly nodes: Node[] = [];
  readonly stacks: Stack[] = [];
  readonly enclosures: Enclosure[] = [];
  readonly edges: Edge[] = [];
  readonly frames: Frame[] = [];
  readonly owner = new Map<Element, Stack | Placement>();
  readonly sizeGroups: Array<{ members: Node[]; width: boolean; height: boolean }> = [];
  /**
   * Parts a step focuses together with a container, beyond what it encloses or stacks:
   * a sequence's messages and notes, a fragment's messages.
   */
  readonly groups = new Map<Element | Frame, Array<Element | Edge | Frame>>();
  readonly diagnostics: Diagnostic[] = [];
  /** Categories in the order the drawing first uses them, which sets their colors. */
  readonly categories: string[] = [];

  /** A component, service, or step: a rectangle fitted around its text. */
  box(label: string, options: NodeOptions = {}): Node {
    return this.add(new Node("box", label, options));
  }
  /** Storage: a database, a cache, a queue. */
  cylinder(label: string, options: NodeOptions = {}): Node {
    return this.add(new Node("cylinder", label, options));
  }
  /** Free-standing text without an outline. */
  text(label: string, options: NodeOptions = {}): Node {
    return this.add(new Node("text", label, options));
  }
  /** A person or outside system that acts: a figure above its name. */
  actor(label: string, options: NodeOptions = {}): Node {
    return this.add(new Node("actor", label, options));
  }
  /** An annotation with a folded corner. */
  note(label: string, options: NodeOptions = {}): Node {
    return this.add(new Node("note", label, options));
  }
  /** A decision: a diamond around a short question. */
  decision(label: string, options: NodeOptions = {}): Node {
    return this.add(new Node("diamond", label, options));
  }
  /**
   * A start point: a filled dot. A label, such as the event that starts the flow, sits
   * outside the dot and does not move it: layout and gaps use the dot alone.
   */
  start(label = "", options: TerminalOptions = {}): Node {
    return this.terminal("dot", "start", label, options);
  }
  /** An end point: a ringed dot, with an optional label outside it, as for `start`. */
  end(label = "", options: TerminalOptions = {}): Node {
    return this.terminal("ring", "end", label, options);
  }
  private terminal(shape: Shape, kind: string, label: string, options: TerminalOptions): Node {
    const node = new Node(shape, label, options, {
      ...(label ? {} : { id: `${kind}-${this.nodes.length + 1}` }),
    });
    return this.add(node);
  }
  /** A title over rows, like a type, table, or message. `rec.row(i)` is an anchor on row i. */
  record(title: string, rows: string[], options: NodeOptions = {}): Node {
    return this.add(new Node("record", title, options, { rows }));
  }
  /**
   * A sequence diagram: the participants in a row, lifelines, and messages in time order.
   * Returns one element that can be placed like any other.
   */
  sequence(participants: Node[], steps: SequenceStep[], options: SequenceOptions = {}): Element {
    return sequence(this, participants, steps, options);
  }
  /** A titled region between two corners, such as a UML fragment. */
  frame(from: PointLike, to: PointLike, options: FrameOptions = {}): Frame {
    const frame = new Frame(from, to, options, this.frames.length + 1);
    this.frames.push(frame);
    return frame;
  }

  row(children: Element[], options: StackOptions = {}): Stack {
    return this.stack("row", children, options);
  }
  column(children: Element[], options: StackOptions = {}): Stack {
    return this.stack("column", children, options);
  }

  place(el: Element, options: PlaceOptions): Element {
    const dirs = (["below", "above", "leftOf", "rightOf"] as const).filter((d) => options[d]);
    const count = dirs.length + (options.at ? 1 : 0);
    if (count !== 1) {
      this.report(
        "INVALID_PLACEMENT",
        `place(${el.id}) needs exactly one of below, above, leftOf, rightOf, or at; got ${count}.`,
        [el.id],
      );
      return el;
    }
    const dir = dirs[0];
    const ref = dir ? options[dir] : undefined;
    const placement: Placement =
      dir && ref
        ? {
            kind: "relative",
            dir,
            ref,
            gap: options.gap ?? (dir === "below" || dir === "above" ? 64 : 88),
            align: options.align ?? "center",
          }
        : { kind: "at", at: options.at ?? [0, 0], anchor: options.anchor ?? "center" };
    this.own(el, placement, "place()");
    return el;
  }

  enclose(members: Element[], options: EncloseOptions = {}): Enclosure {
    const e = new Enclosure(members, options, this.enclosures.length + 1);
    this.enclosures.push(e);
    this.noteCategory(options.category);
    return e;
  }

  /** An arrow. A string third argument is its label. `d.arrow(a, a)` draws a self-loop. */
  arrow(from: PointLike, to: PointLike, options: string | EdgeOptions = {}): Edge {
    const edge = new Edge(from, to, typeof options === "string" ? { label: options } : options);
    this.edges.push(edge);
    this.noteCategory(edge.category);
    return edge;
  }
  /** A connection without arrowheads. */
  line(from: PointLike, to: PointLike, options: string | EdgeOptions = {}): Edge {
    return this.arrow(
      from,
      to,
      typeof options === "string" ? { label: options, ends: "--" } : { ends: "--", ...options },
    );
  }

  /** Give these nodes the largest measured width and height among them. */
  equalSize(nodes: Node[]) {
    this.sizeGroups.push({ members: nodes, width: true, height: true });
  }
  equalWidth(nodes: Node[]) {
    this.sizeGroups.push({ members: nodes, width: true, height: false });
  }
  equalHeight(nodes: Node[]) {
    this.sizeGroups.push({ members: nodes, width: false, height: true });
  }

  point(x: number, y: number): Point {
    return new Point({ k: "abs", x, y });
  }
  /** The x coordinate of `x` combined with the y coordinate of `y`. */
  xy(x: PointLike, y: PointLike): Point {
    return new Point({ k: "xy", x: toExpr(x), y: toExpr(y) });
  }
  /** Linear interpolation: t = 0 at a, 1 at b. */
  lerp(a: PointLike, b: PointLike, t = 0.5): Point {
    return new Point({ k: "lerp", a: toExpr(a), b: toExpr(b), t });
  }

  private noteCategory(category: string | undefined) {
    if (category !== undefined && !this.categories.includes(category))
      this.categories.push(category);
  }

  private add(node: Node): Node {
    this.nodes.push(node);
    this.noteCategory(node.options.category);
    return node;
  }
  private stack(dir: "row" | "column", children: Element[], options: StackOptions): Stack {
    const s = new Stack(dir, children, options, this.stacks.length + 1);
    this.stacks.push(s);
    for (const child of children) this.own(child, s, `${dir}(${s.id})`);
    return s;
  }
  private own(el: Element, owner: Stack | Placement, by: string) {
    if (el instanceof Enclosure) {
      this.report(
        "ENCLOSURE_PLACEMENT",
        `${el.id} is an enclosure; its bounds come from its members. Position the members instead.`,
        [el.id],
      );
      return;
    }
    const existing = this.owner.get(el);
    if (existing) {
      const prior = existing instanceof Stack ? `${existing.direction}(${existing.id})` : "place()";
      this.report(
        "CONFLICTING_PLACEMENT",
        `${el.id} is positioned by both ${prior} and ${by}. Each element has one position owner.`,
        [el.id],
      );
      return;
    }
    this.owner.set(el, owner);
  }
  private report(code: DiagnosticCode, message: string, ids: string[]) {
    this.diagnostics.push({ code, message, ids });
  }
}

export function toExpr(p: PointLike): PointExpr {
  if (p instanceof Point) return p.expr;
  if (Array.isArray(p)) return { k: "abs", x: p[0], y: p[1] };
  return { k: "anchor", el: p, name: "center" };
}

/** The element a point is derived from: offset → base, xy → x, lerp → a. */
export function elementOf(p: PointLike): Element | undefined {
  if (Array.isArray(p)) return;
  if (!(p instanceof Point)) return p;
  let e = p.expr;
  for (;;) {
    if (e.k === "offset") e = e.base;
    else if (e.k === "xy") e = e.x;
    else if (e.k === "lerp") e = e.a;
    else break;
  }
  return e.k === "anchor" || e.k === "port" || e.k === "row" ? e.el : undefined;
}

function refName(p: PointLike): string {
  if (Array.isArray(p)) return `${p[0]},${p[1]}`;
  return elementOf(p)?.id ?? "point";
}

export function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "node"
  );
}
