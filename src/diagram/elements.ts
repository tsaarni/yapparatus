/**
 * The handles an author holds while drawing: elements, points, edges, frames, and their options.
 * Nothing is measured or positioned here; `compile` resolves geometry later.
 */
import type { DiagnosticCode } from "../document/diagnostic.ts";
import type { AnchorName, Side } from "./geometry.ts";

export type { AnchorName, Side };

/** What an element is for: the one to look at, a risk, a quiet element, or one outside the system. */
export type Role = "default" | "accent" | "muted" | "warning" | "external";
export type Align = "start" | "center" | "end";
export type Corner = "topLeft" | "topRight" | "bottomLeft" | "bottomRight";

/** A problem in a diagram. Its severity is its code's, in `diagnosticCodes`. */
export interface Diagnostic {
  code: DiagnosticCode;
  message: string;
  /** The elements it is about, which also identify it. */
  ids: string[];
  /** What it is about when no element is, such as a step's id. */
  subject?: string;
}

/* ---------- Points ---------- */

export type PointExpr =
  | { k: "anchor"; el: Element; name: AnchorName }
  | { k: "port"; el: Element; side: Side; t: number }
  | { k: "abs"; x: number; y: number }
  | { k: "offset"; base: PointExpr; dx: number; dy: number }
  | { k: "xy"; x: PointExpr; y: PointExpr }
  | { k: "lerp"; a: PointExpr; b: PointExpr; t: number };

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
  /** A member of a record: one cell of its grid. */
  | "cell"
  /** A member of a text: a highlighted span or range of lines. */
  | "mark"
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
   * What sets this element apart, in a few words, such as "New" or "To be removed". Elements with
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

/** Options of one member: a record cell or a text mark. */
export interface MemberOptions {
  /** The member's own id, after the parent's: `users.id`. Default: derived from the label. */
  id?: string;
  role?: Role;
  category?: string;
  stepOnly?: boolean;
  /**
   * A numbered badge on the member's corner, for a remark the text or a note refers to by
   * number. It stands in for a pointer where no line can reach, such as an inner packet field.
   */
  pin?: number;
}

export interface CellOptions extends MemberOptions {
  /** Grid columns the cell covers. Default: 1. Whole rows make it taller: 64 of 32 is two rows. */
  span?: number;
}

/**
 * A record cell: its text, with its span or its options. Tabs in the text line up with the
 * tabs of the other cells, which makes columns in a table.
 */
export type Cell = string | [label: string, span: number] | [label: string, options: CellOptions];

export interface RecordOptions extends Omit<NodeOptions, "sub"> {
  title?: string;
  /** Column names over the cells, separated by tabs like the cells: `"name\ttype"`. */
  header?: string;
  /** Grid columns. Cells fill them left to right and wrap. Default: 1, one cell per row. */
  columns?: number;
  /**
   * Labels over each column and beside each row, from their index: `top: (i) => 31 - i`,
   * `left: (row) => row * 4`. An empty string skips a label.
   */
  ruler?: { top?: (column: number) => string | number; left?: (row: number) => string | number };
}

/** A highlighted span of a text: a substring that occurs once, or lines (`"2"`, `"2-4"`, from 1). */
export type Mark = MemberOptions & ({ text: string } | { lines: string });

export interface TextOptions extends NodeOptions {
  /** Named spans or lines, each a member: `t.element("path")`. A string is the text to mark. */
  marks?: Record<string, string | Mark>;
}

/** What the library sets on nodes it draws itself; outside the authoring API. */
export interface NodeInternals {
  /** A derived id that is not the label's slug, such as `start-1`. */
  id?: string;
  /** Whether that id is the author's: a member's own id, given in its options. */
  explicit?: boolean;
  /** The shape this one is a member of, and its place there. */
  member?: Member;
  /** Decoration only: excluded from overlap and crossing checks, never interactive. */
  passive?: boolean;
  /** A decoration that steps show and fade with this edge, such as an activation bar. */
  follows?: Edge;
}

/** Where a member sits in its parent, and its own id there. */
export type Place =
  | { kind: "cell"; span: number }
  | { kind: "mark"; text: string }
  | { kind: "mark"; lines: string };
export type Member = Place & { parent: Node; own: string; pin?: number };

export class Node extends Element {
  readonly shape: Shape;
  readonly label: string;
  readonly options: NodeOptions &
    Pick<TerminalOptions, "side"> &
    Pick<RecordOptions, "columns" | "ruler" | "header">;
  readonly passive: boolean;
  readonly follows: Edge | undefined;
  /** Set on a member: its parent and its place there. */
  readonly member: Member | undefined;
  /** Record cells or text marks, in order. */
  readonly members: Node[] = [];
  constructor(
    shape: Shape,
    label: string,
    options: Node["options"],
    internals: NodeInternals = {},
  ) {
    super(
      options.id ?? internals.id ?? slug(label),
      options.id !== undefined || !!internals.explicit,
    );
    this.shape = shape;
    this.label = label;
    this.options = options;
    this.passive = internals.passive ?? false;
    this.follows = internals.follows;
    this.member = internals.member;
  }
  /** Set by the builder: where a missing member is reported. */
  report?: (code: DiagnosticCode, message: string, ids: string[]) => void;
  /**
   * A member, by its own id: a record cell, such as `users.element("team-id")`, or a text mark.
   * It is an element like any other: edges attach to it, steps focus it, and it takes a category.
   * A missing member is reported, and the parent stands in for it.
   */
  element(id: string): Node {
    const found = this.members.find((m) => m.member?.own === id);
    if (found) return found;
    this.report?.(
      "UNKNOWN_ELEMENT",
      `${this.id} has no member "${id}". Members: ${this.members.map((m) => m.member?.own).join(", ") || "none"}.`,
      [this.id],
    );
    return this;
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
   * What sets this element apart, in a few words, such as "New" or "To be removed". Elements with
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
   * What sets this element apart, in a few words, such as "New" or "To be removed". Elements with
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

/** What the library sets on edges it draws itself; outside the authoring API. */
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
  /** Whether the id joins the ids of the ends, which are final only at compile time. */
  readonly fromEnds: boolean;
  constructor(from: PointLike, to: PointLike, options: EdgeOptions, internals: EdgeInternals = {}) {
    this.id = options.id ?? internals.derivedId ?? `${refName(from)}->${refName(to)}`;
    this.fromEnds = options.id === undefined && internals.derivedId === undefined;
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
  /** Join the ids of the ends again, once they are final. */
  deriveId() {
    if (this.fromEnds) this.id = `${refName(this.from)}->${refName(this.to)}`;
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
  return e.k === "anchor" || e.k === "port" ? e.el : undefined;
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
