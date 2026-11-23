/**
 * The handles an author holds while drawing: elements, points, edges, and their options.
 * Nothing is measured or positioned here; `compile` resolves geometry later.
 */
import type { DiagnosticCode } from "../document/diagnostic.ts";
import type { AnchorName, Side } from "./geometry.ts";
import { defaultGap } from "./metrics.ts";

export type { AnchorName, Side };

/** What an element is for: the one to look at, a risk, a quiet one, or one outside the system. */
export type Role = "default" | "accent" | "muted" | "warning" | "external";
/** Where a grid cell sits in its track, or a placed element across its reference. */
export type Align = "start" | "center" | "end";
/** A corner of an element, such as where an enclosure holds its title. */
export type Corner = "topLeft" | "topRight" | "bottomLeft" | "bottomRight";

/** A problem in a diagram. Its severity is its code's, in `diagnosticCodes`. */
export interface Diagnostic {
  code: DiagnosticCode;
  message: string;
  /** The elements it is about, which also identify it. */
  ids: string[];
  /**
   * What it is about besides its elements, such as a step's id or an option's name, so that
   * two problems on one element are two diagnostics.
   */
  subject?: string;
}

/** Anything with an id that the id check settles, which a diagnostic can be about. */
export type Named = Element | Edge;

/**
 * Reports a problem that a call finds. `message` is written once the ids of the elements in
 * `about` are final, so it reads their ids when it runs.
 */
export type Reporter = (
  code: DiagnosticCode,
  about: Named[],
  message: () => string,
  subject?: string,
) => void;

/** An element's method whose arguments the scene checks. */
export type Method = "port" | "member" | "offset";

/**
 * Checks the arguments of an element's method and gives the ones to use, or `undefined` for one
 * that nothing stands in for. The scene sets it and reports the problems about the element.
 */
export type MethodCheck = (self: Named | undefined, method: Method, given: unknown[]) => unknown[];

/** How a point is derived, resolved to coordinates at compile time. */
export type PointExpr =
  | { k: "anchor"; el: Element; name: AnchorName }
  | { k: "port"; el: Element; side: Side; t: number }
  | { k: "abs"; x: number; y: number }
  | { k: "offset"; base: PointExpr; dx: number; dy: number }
  | { k: "xy"; x: PointExpr; y: PointExpr }
  | { k: "lerp"; a: PointExpr; b: PointExpr; t: number }
  /** The middle of the gap after a grid's column (`x`) or row (`y`), at the grid's center. */
  | { k: "gutter"; grid: Grid; axis: "x" | "y"; index: number };

/** A lazily resolved point. Coordinates are known only after compilation. */
export class Point {
  readonly expr: PointExpr;
  /** The check of `offset`'s arguments, from the element or the call that made the point. */
  readonly checkArgs: MethodCheck | undefined;
  constructor(expr: PointExpr, checkArgs?: MethodCheck) {
    this.expr = expr;
    this.checkArgs = checkArgs;
  }
  /** Shift by dx rightward and dy downward. */
  offset(dx: number, dy: number): Point {
    const given = [dx, dy];
    const [x = 0, y = 0] = (this.checkArgs?.(elementOf(this), "offset", given) ?? given) as [
      number?,
      number?,
    ];
    return new Point({ k: "offset", base: this.expr, dx: x, dy: y }, this.checkArgs);
  }
}

/** Anything an edge or placement accepts as a point: a point, an element's center, or [x, y]. */
export type PointLike = Point | Element | [number, number];

/** An element: an id, and named anchors and ports on its outline. */
abstract class Element {
  /** Explicit ids are fixed; derived ids get a numeric suffix when they collide. */
  id: string;
  /** True when the author supplied the id; derived ids may change with labels. */
  readonly explicitId: boolean;
  constructor(id: string, explicit: boolean) {
    this.id = id;
    this.explicitId = explicit;
  }
  /** Set by the scene: the check of a method's arguments. */
  checkArgs?: MethodCheck;
  private a(name: AnchorName) {
    return new Point({ k: "anchor", el: this, name }, this.checkArgs);
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
    const [s, at] = (this.checkArgs?.(this, "port", [side, t]) ?? [side, t]) as [Side?, number?];
    if (s === undefined) return this.center;
    return new Point({ k: "port", el: this, side: s, t: at ?? 0.5 }, this.checkArgs);
  }
}

export type { Element };

/** The shape of a node, which sets how it is measured and drawn. */
export type Shape =
  | "box"
  | "cylinder"
  | "io"
  | "doc"
  | "queue"
  | "text"
  | "actor"
  /** An icon above its label. */
  | "icon"
  | "note"
  | "decision"
  | "start"
  | "end"
  | "record"
  /** A member of a record: one cell of its grid. */
  | "cell"
  /** A member of a text: a highlighted span or range of lines. */
  | "mark"
  /** Internal: activation bars in sequence diagrams. */
  | "bar"
  /** Internal: empty space that reserves room, such as under a sequence's lifelines. */
  | "space";

/** Options of a node shape such as `box` or `cylinder`. */
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
  /** Fixed width; text wraps inside it. Default: fit the text, wrapped at the shape's limit. */
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

/** Options of a box or a document, which can be drawn as a stack of replicas. */
export interface StackOptions extends NodeOptions {
  /**
   * Draw a stack of this many boxes or pages, from 2 to 4, for replicas such as pods or shards.
   * Put a larger or unknown number in the label.
   */
  replicas?: number;
}

/** Options of a box: a stack of replicas, and an icon left of the label. */
export interface BoxOptions extends StackOptions {
  /** A Lucide icon's name, such as `"database"`, drawn left of the label in the label's color. */
  icon?: string;
}

/** Options for `start()` and `end()`. Their size is fixed, so they take no size options. */
export interface TerminalOptions
  extends Pick<NodeOptions, "id" | "sub" | "role" | "category" | "stepOnly"> {
  /** The side of the dot where the label sits. Default: right. */
  labelSide?: Side;
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

/** Options of one record cell. */
export interface CellOptions extends MemberOptions {
  /** Grid columns the cell covers. Default: 1. Whole rows make it taller: 64 of 32 is two rows. */
  span?: number;
}

/**
 * A record cell: its text, with its span or its options. Tabs in the text line up with the
 * tabs of the other cells, which makes columns in a table.
 */
export type Cell = string | [label: string, span: number] | [label: string, options: CellOptions];

/** Options of a record: a title over a grid of cells. Its size comes from the cells and `width`. */
export interface RecordOptions
  extends Pick<NodeOptions, "id" | "role" | "category" | "width" | "mono" | "stepOnly"> {
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

/** Whole lines of a text, from 1: one line, or the first and the last, such as `[2, 4]`. */
export type Lines = number | [number, number];
/** A highlighted span of a text: a substring that occurs once, or whole lines. */
export type Mark = Omit<MemberOptions, "id"> & ({ text: string } | { lines: Lines });
/** A mark's options as one object, with one of `text` and `lines`. Its name is its id. */
export type MarkOptions = Omit<MemberOptions, "id"> & { text?: string; lines?: Lines };

/** Options of a text node, with its marked spans. */
export interface TextOptions extends NodeOptions {
  /** Named spans or lines, each a member: `t.member("path")`. A string is the text to mark. */
  marks?: Record<string, string | Mark>;
}

/** What the library sets on nodes it draws itself; outside the authoring API. */
export interface NodeInternals {
  /** A derived id that is not the label's slug, such as `start-1`. */
  id?: string;
  /** Whether that id is the author's: a member's own id, given in its options. */
  explicit?: boolean;
  /** The shape this one is a member of, and its place there. */
  membership?: Membership;
  /** Decoration only: excluded from overlap and crossing checks, never interactive. */
  passive?: boolean;
  /** A decoration that steps show and fade with this edge, such as an activation bar. */
  follows?: Edge;
}

/** Where a member sits in its parent: a cell with its span, or a mark with its text or lines. */
export type Place =
  | { kind: "cell"; span: number }
  | { kind: "mark"; text: string }
  | { kind: "mark"; lines: Lines };
/** A member's place, its parent, its own id there, and its badge number. */
export type Membership = Place & { parent: Node; own: string; pin?: number };

/** A drawn shape with a label, such as a box, a record, or a text, and its members. */
export class Node extends Element {
  readonly shape: Shape;
  readonly label: string;
  readonly options: NodeOptions &
    Pick<BoxOptions, "replicas" | "icon"> &
    Pick<TerminalOptions, "labelSide"> &
    Pick<RecordOptions, "columns" | "ruler" | "header">;
  readonly passive: boolean;
  readonly follows: Edge | undefined;
  /** Set on a member: its parent and its place there. */
  readonly membership: Membership | undefined;
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
    this.membership = internals.membership;
  }
  /** Set by the scene: where a missing member is reported. */
  report?: Reporter;
  /**
   * A member by its own id, such as `users.member("team_id")`, usable like any element.
   * A missing member is reported, and the parent stands in for it.
   */
  member(id: string): Node {
    const [own] = (this.checkArgs?.(this, "member", [id]) ?? [id]) as [string?];
    if (own === undefined) return this;
    const found = this.members.find((m) => m.membership?.own === own);
    if (found) return found;
    this.report?.(
      "UNKNOWN_ELEMENT",
      [this],
      () =>
        `${this.id} has no member "${own}". Members: ${this.members.map((m) => m.membership?.own).join(", ") || "none"}.`,
    );
    return this;
  }
}

/** Options of a grid. */
export interface GridOptions {
  id?: string;
  /** Space between columns and rows: one number, or `[columnGap, rowGap]`. Default: [88, 64]. */
  gap?: number | [number, number];
  /** A cell's place in its track: one value, or `[horizontal, vertical]`. Default: center. */
  align?: Align | [Align, Align];
}

/** Options of a row or column: the gap between its cells, and their alignment across it. */
export interface LineOptions {
  id?: string;
  gap?: number;
  align?: Align;
}

/**
 * Rows of cells on shared tracks: columns as wide as their widest cell, rows as tall as their
 * tallest. A row and a column are grids too. It owns its cells' positions and is placeable.
 */
export class Grid extends Element {
  /** The call that made it, which also names it: `grid`, `row`, or `column`. */
  readonly kind: "grid" | "row" | "column";
  /** The cells by row; `null` is an empty cell, and rows may differ in length. */
  readonly rows: ReadonlyArray<ReadonlyArray<Element | null>>;
  readonly gap: { x: number; y: number };
  readonly align: { x: Align; y: Align };
  constructor(
    kind: Grid["kind"],
    rows: ReadonlyArray<ReadonlyArray<Element | null>>,
    options: GridOptions,
    name: string,
  ) {
    super(options.id ?? name, options.id !== undefined);
    this.kind = kind;
    this.rows = rows.map((row) => [...row]);
    const [x, y] = Array.isArray(options.gap)
      ? options.gap
      : [options.gap ?? defaultGap.x, options.gap ?? defaultGap.y];
    this.gap = { x, y };
    const [ax, ay] = Array.isArray(options.align)
      ? options.align
      : [options.align ?? "center", options.align ?? "center"];
    this.align = { x: ax, y: ay };
  }
  /** Set by the scene: where a gutter that does not exist is reported. */
  report?: Reporter;
  /** The cells that hold an element, row by row. */
  get children(): Element[] {
    return this.rows.flatMap((row) =>
      row.filter((cell): cell is Element => cell !== null && cell !== undefined),
    );
  }
  /** The number of columns: the length of the longest row. */
  get columnCount(): number {
    return Math.max(0, ...this.rows.map((row) => row.length));
  }
  /** A point in the middle of the gap after column `i`, from 0: an x for `viaX`. */
  gutterX(i: number): Point {
    return this.gutter("x", i, this.columnCount);
  }
  /** A point in the middle of the gap after row `i`, from 0: a y for `viaY`. */
  gutterY(i: number): Point {
    return this.gutter("y", i, this.rows.length);
  }
  /** A gutter, or the grid's center when no gap follows track `i`, which is reported. */
  private gutter(axis: "x" | "y", i: number, tracks: number): Point {
    if (Number.isInteger(i) && i >= 0 && i < tracks - 1)
      return new Point({ k: "gutter", grid: this, axis, index: i }, this.checkArgs);
    const track = axis === "x" ? "column" : "row";
    const count = `${tracks} ${track}${tracks === 1 ? "" : "s"}`;
    const range =
      tracks > 2
        ? `takes 0 to ${tracks - 2}`
        : tracks === 2
          ? "takes only 0"
          : "has no gap to name";
    this.report?.(
      "UNKNOWN_GUTTER",
      [this],
      () => `${this.id} has ${count}, so gutter${axis.toUpperCase()} ${range}; got ${String(i)}.`,
    );
    return this.center;
  }
}

/** Options of an enclosure. */
export interface EncloseOptions {
  id?: string;
  title?: string;
  /** The corner that holds the title. Default: topLeft. */
  titleCorner?: Corner;
  padding?: number;
  /** Default: muted. */
  role?: Role;
  /**
   * What sets this element apart, in a few words, such as "New" or "To be removed". Elements with
   * the same category share a color, and a legend under the figure explains each color.
   */
  category?: string;
  /** Show only while a step focuses it, such as a boundary that one step points out. */
  stepOnly?: boolean;
}

/** A boundary drawn around elements positioned elsewhere. It never moves them. */
export class Enclosure extends Element {
  readonly members: Element[];
  readonly options: EncloseOptions;
  /** `name` is the id without an `id` or a title, such as `enclosure-1`. */
  constructor(members: Element[], options: EncloseOptions, name: string) {
    super(options.id ?? (options.title ? slug(options.title) : name), !!options.id);
    this.members = members;
    this.options = options;
  }
}

/** How an edge travels between its ends. */
export type Route =
  | "straight"
  /** Horizontal first leg, then vertical. */
  | "hv"
  /** Vertical first leg, then horizontal. */
  | "vh"
  | { via: PointLike[] }
  /** Horizontal, then vertical along this x, or the x of this point, then horizontal. */
  | { viaX: number | PointLike }
  /** Vertical, then horizontal along this y, or the y of this point, then vertical. */
  | { viaY: number | PointLike }
  /** Curve a straight edge this many units to its left, seen in the direction of travel. */
  | { bend: number }
  /** Leave and return on this side: the route of an edge from an element to itself. */
  | { loop: Side };

/** An edge label and where on the route it sits. */
export interface LabelOptions {
  text: string;
  /** Zero-based leg of the route. Default: the longest leg. */
  segment?: number;
  /** Position along that leg, 0→1. Default: 0.5. */
  along?: number;
  /**
   * The side of the leg where the label sits: `top` is above it. Default: top of horizontal legs,
   * right of vertical legs, outside curves and loops.
   */
  side?: Side;
  gap?: number;
}

/** The arrowhead at one end of an edge: a filled or an open head, or none. */
export type HeadKind = "filled" | "open" | "none";

/** Options of an edge. */
export interface EdgeOptions {
  id?: string;
  /** The edge's label, or a list of its labels: each is its text or its text with options. */
  label?: string | LabelOptions | Array<string | LabelOptions>;
  /** Default: `{ loop: "right" }` from an element to itself, else `"straight"`. */
  route?: Route;
  role?: Role;
  /**
   * What sets this element apart, in a few words, such as "New" or "To be removed". Elements with
   * the same category share a color, and a legend under the figure explains each color.
   */
  category?: string;
  dashed?: boolean;
  /** The arrowhead at the `to` end. Default: "filled" on an arrow, "none" on a line. */
  head?: HeadKind;
  /** The arrowhead at the `from` end. Default: "none". */
  tail?: HeadKind;
  /** Show only while a step focuses it, such as a message that comes and goes. */
  stepOnly?: boolean;
}

/** What the library sets on edges it draws itself; outside the authoring API. */
export interface EdgeInternals {
  /** Decoration only, such as a lifeline: drawn underneath and excluded from checks. */
  passive?: boolean;
  /** The id to use when the author gives none. Default: `<from>-><to>`. */
  derivedId?: string;
  /** Focused only by a step that names it, never by its ends, such as a sequence message. */
  byName?: boolean;
  /** Put a label without a segment on the last leg, this many units before the `to` end. */
  labelBeforeEnd?: number;
}

/** A line between two points or elements, with its route, style, and labels. */
export class Edge {
  /** Explicit ids are fixed; derived ids get a numeric suffix when they collide. */
  id: string;
  readonly explicitId: boolean;
  readonly from: PointLike;
  readonly to: PointLike;
  readonly route: Route;
  readonly role: Role;
  readonly category: string | undefined;
  readonly dashed: boolean;
  readonly head: HeadKind;
  readonly tail: HeadKind;
  readonly passive: boolean;
  readonly stepOnly: boolean;
  /** Focused only by a step that names it, never by its ends. */
  readonly byName: boolean;
  readonly labels: readonly LabelOptions[];
  /** Units before the `to` end where a label without a segment sits on the last leg. */
  readonly labelBeforeEnd: number | undefined;
  /** Whether the id joins the ids of the ends, which are final only at compile time. */
  readonly fromEnds: boolean;
  constructor(from: PointLike, to: PointLike, options: EdgeOptions, internals: EdgeInternals = {}) {
    this.id = options.id ?? internals.derivedId ?? `${refName(from)}->${refName(to)}`;
    this.fromEnds = options.id === undefined && internals.derivedId === undefined;
    this.explicitId = options.id !== undefined;
    this.from = from;
    this.to = to;
    this.route = options.route ?? defaultRoute(from, to);
    this.role = options.role ?? "default";
    this.category = options.category;
    this.dashed = options.dashed ?? false;
    this.head = options.head ?? "filled";
    this.tail = options.tail ?? "none";
    this.passive = internals.passive ?? false;
    this.stepOnly = options.stepOnly ?? false;
    this.byName = internals.byName ?? false;
    this.labelBeforeEnd = internals.labelBeforeEnd;
    this.labels = [options.label ?? []]
      .flat()
      .map((l) => (typeof l === "string" ? { text: l } : l))
      .filter((l) => l.text !== "");
  }
  /** Join the ids of the ends again, once they are final. */
  deriveId() {
    if (this.fromEnds) this.id = `${refName(this.from)}->${refName(this.to)}`;
  }
}

/** Options of a frame, such as a sequence diagram's `alt` or `loop` fragment. */
export interface FrameOptions {
  id?: string;
  /** Tab label in the top-left corner, such as "alt" or "loop". */
  tab?: string;
  /** Text after the tab, such as a guard condition. */
  title?: string;
  /** Dashed horizontal dividers, each with an optional label, at these points' y. */
  dividers?: Array<{ at: PointLike; label?: string }>;
  /** Default: none, which draws the frame's own hairline look. */
  role?: Role;
  /**
   * What sets this element apart, in a few words, such as "New" or "To be removed". Elements with
   * the same category share a color, and a legend under the figure explains each color.
   */
  category?: string;
  /** Show only while a step focuses it, such as a region that one step points out. */
  stepOnly?: boolean;
}

/**
 * A titled region between two corner points. It neither owns nor moves anything. Its derived
 * id is its tab and title as a slug, such as `loop-until-empty`, or `name` without them.
 */
export class Frame extends Element {
  readonly from: PointLike;
  readonly to: PointLike;
  readonly options: FrameOptions;
  constructor(from: PointLike, to: PointLike, options: FrameOptions, name: string) {
    const text = [options.tab, options.title].filter(Boolean).join(" ");
    super(options.id ?? (text ? slug(text) : name), options.id !== undefined);
    this.from = from;
    this.to = to;
    this.options = options;
  }
}

/** Where an element is put: next to a reference element, or with an anchor at a point. */
export type Placement =
  | {
      kind: "relative";
      dir: "below" | "above" | "leftOf" | "rightOf";
      ref: Element;
      gap: number;
      align: Align;
    }
  | { kind: "at"; at: PointLike; anchor: AnchorName };

/** Options of `place()`: one reference direction, or `at` a point. */
export interface PlaceOptions {
  below?: Element;
  above?: Element;
  leftOf?: Element;
  rightOf?: Element;
  /** Boundary-to-boundary distance. Default: 64 vertically, 88 horizontally, as in a grid. */
  gap?: number;
  /** Cross-axis alignment with the reference. Default: center. */
  align?: Align;
  /** Put the element's `anchor` (default: center) at this point. */
  at?: PointLike;
  anchor?: AnchorName;
}

/** The expression of a point; an element stands for its center. */
export function toExpr(p: PointLike): PointExpr {
  if (p instanceof Point) return p.expr;
  if (Array.isArray(p)) return { k: "abs", x: p[0], y: p[1] };
  return { k: "anchor", el: p, name: "center" };
}

/** The point with the x coordinate of `x` and the y coordinate of `y`. */
export function xy(x: PointLike, y: PointLike): Point {
  return new Point({ k: "xy", x: toExpr(x), y: toExpr(y) });
}

/** The point between `a` and `b` by linear interpolation: t = 0 at a, 1 at b. */
export function lerp(a: PointLike, b: PointLike, t = 0.5): Point {
  return new Point({ k: "lerp", a: toExpr(a), b: toExpr(b), t });
}

/** Whether an edge goes from an element to itself: both ends are the same element object. */
export function isSelfEdge(from: PointLike, to: PointLike): boolean {
  return from === to && !(from instanceof Point) && !Array.isArray(from);
}

/** The route of an edge that gives none. */
export function defaultRoute(from: PointLike, to: PointLike): Route {
  return isSelfEdge(from, to) ? { loop: "right" } : "straight";
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
  if (e.k === "gutter") return e.grid;
  return e.k === "anchor" || e.k === "port" ? e.el : undefined;
}

/** The element an edge end stands for: itself, or that of an anchor, port, or offset of one. */
export function elementAt(p: PointLike): Element | undefined {
  if (Array.isArray(p)) return;
  if (!(p instanceof Point)) return p;
  let e = p.expr;
  while (e.k === "offset") e = e.base;
  return e.k === "anchor" || e.k === "port" ? e.el : undefined;
}

/** The name a derived edge id uses for an end: its element's id, or its coordinates. */
function refName(p: PointLike): string {
  if (Array.isArray(p)) return `${p[0]},${p[1]}`;
  return elementOf(p)?.id ?? "point";
}

/** An id from a label: lowercase letters, digits, and underscores joined by dashes, or "node". */
export function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "-")
      .replace(/^-|-$/g, "") || "node"
  );
}
