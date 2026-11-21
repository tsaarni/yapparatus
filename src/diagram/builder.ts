/**
 * The object a draw program receives as `d`: the documented calls, each of which records
 * elements in a scene. Nothing is measured or positioned here; `compile` resolves geometry later.
 */
import {
  type BoxOptions,
  type Cell,
  defaultRoute,
  Edge,
  type EdgeOptions,
  type Element,
  type EncloseOptions,
  type Enclosure,
  elementOf,
  type Frame,
  type FrameOptions,
  type Grid,
  type GridOptions,
  isSelfEdge,
  type LineOptions,
  lerp,
  type MarkOptions,
  type MemberOptions,
  type Node,
  type NodeOptions,
  type Place,
  type Placement,
  type PlaceOptions,
  Point,
  type PointLike,
  type RecordOptions,
  type Shape,
  type StackOptions,
  slug,
  type TerminalOptions,
  type TextOptions,
  xy,
} from "./elements.ts";
import { defaultGap } from "./metrics.ts";
import type { Scene } from "./scene.ts";
import { type SequenceOptions, type SequenceStep, sequence } from "./sequence.ts";
import { CallCheck, isNamed, quote, type Signature } from "./signature.ts";
import { signatures } from "./signatures.ts";
import { type TreeChild, type TreeOptions, tree } from "./tree.ts";

/** The relative placements, each with the axis its default gap is on. */
const directions = { below: "y", above: "y", leftOf: "x", rightOf: "x" } as const;

/**
 * The author's calls. Its state is the scene it records into and the count of each call,
 * which a draw program cannot reach. Each call checks what it is given against its signature.
 */
export class DiagramBuilder {
  readonly #scene: Scene;
  readonly #counts = new Map<string, number>();
  constructor(scene: Scene) {
    this.#scene = scene;
  }

  /** A component, service, or step: a rectangle fitted around its text. */
  box(label: string, options: BoxOptions = {}): Node {
    return this.#shape(signatures.box, "box", label, options);
  }
  /** Storage: a database, a cache. */
  cylinder(label: string, options: NodeOptions = {}): Node {
    return this.#shape(signatures.cylinder, "cylinder", label, options);
  }
  /** Input or output of a flow: a parallelogram around its text. */
  io(label: string, options: NodeOptions = {}): Node {
    return this.#shape(signatures.io, "io", label, options);
  }
  /** A document, a report, a file: a page with a wavy bottom. */
  doc(label: string, options: StackOptions = {}): Node {
    return this.#shape(signatures.doc, "doc", label, options);
  }
  /** A queue, a topic, a stream: a cylinder on its side. */
  queue(label: string, options: NodeOptions = {}): Node {
    return this.#shape(signatures.queue, "queue", label, options);
  }
  /** Free-standing text without an outline. `marks` name spans or lines as members. */
  text(label: string, options: TextOptions = {}): Node {
    const call = this.#check(signatures.text);
    const [text, { marks, ...rest }] = call.args([label, options]) as [string, TextOptions];
    const node = this.#scene.addNode("text", text, rest);
    for (const [id, mark] of Object.entries(marks ?? {})) {
      const {
        text: span,
        lines,
        ...o
      }: MarkOptions = typeof mark === "string" ? { text: mark } : mark;
      const place: Place =
        span !== undefined ? { kind: "mark", text: span } : { kind: "mark", lines: lines ?? 1 };
      this.#member(node, span ?? "", { ...o, id }, place);
    }
    call.done([node]);
    return node;
  }
  /** A person or outside system that acts: a figure above its name. */
  actor(label: string, options: NodeOptions = {}): Node {
    return this.#shape(signatures.actor, "actor", label, options);
  }
  /**
   * A thing drawn as a picture, such as a user, a cloud, or a server: a Lucide icon, named
   * without a prefix, above its label.
   */
  icon(name: string, label: string, options: NodeOptions = {}): Node {
    const call = this.#check(signatures.icon);
    const [icon, text, o] = call.args([name, label, options]) as [
      string | undefined,
      string,
      NodeOptions,
    ];
    const node = this.#scene.addNode("icon", text, icon === undefined ? o : { ...o, icon });
    call.done([node]);
    return node;
  }
  /** An annotation with a folded corner. */
  note(label: string, options: NodeOptions = {}): Node {
    return this.#shape(signatures.note, "note", label, options);
  }
  /** A decision: a diamond around a short question. */
  decision(label: string, options: NodeOptions = {}): Node {
    return this.#shape(signatures.decision, "diamond", label, options);
  }
  /**
   * A start point: a filled dot. A label, such as the event that starts the flow, sits
   * outside the dot and does not move it: layout and gaps use the dot alone.
   */
  start(label = "", options: TerminalOptions = {}): Node {
    return this.#terminal(signatures.start, "dot", label, options);
  }
  /** An end point: a ringed dot, with an optional label outside it, as for `start`. */
  end(label = "", options: TerminalOptions = {}): Node {
    return this.#terminal(signatures.end, "ring", label, options);
  }
  /** A shape from its label and options, which its signature checks. */
  #shape(signature: Signature, shape: Shape, label: unknown, options: unknown): Node {
    const call = this.#check(signature);
    const [text, o] = call.args([label, options]) as [string, Node["options"]];
    const node = this.#scene.addNode(shape, text, o);
    call.done([node]);
    return node;
  }
  /** A start or an end. Without a label, its id is the call's name and its count. */
  #terminal(signature: Signature, shape: Shape, label: unknown, options: unknown): Node {
    const call = this.#check(signature);
    const [text, o] = call.args([label, options]) as [string, TerminalOptions];
    const name = this.#name(signature.name);
    const node = this.#scene.addNode(shape, text, o, text ? {} : { id: name });
    if (!text && o.side !== undefined)
      call.ignore(
        "side",
        o.side,
        () => `side is ${quote(o.side)}, but ${node.id} has no label for it to place.`,
      );
    call.done([node]);
    return node;
  }
  /** The id of an element without text: the call's name and its count, such as `row-1`. */
  #name(call: string): string {
    const n = (this.#counts.get(call) ?? 0) + 1;
    this.#counts.set(call, n);
    return `${call}-${n}`;
  }
  /** The check of one call, which reports into the scene. */
  #check(signature: Signature): CallCheck {
    return new CallCheck(this.#scene.report, signature);
  }
  /**
   * Cells on a grid under an optional title: a type, a table, a packet header, a register,
   * an array. Each cell is a member: `rec.member("id")`.
   */
  record(cells: Cell[], options: RecordOptions = {}): Node {
    const call = this.#check(signatures.record);
    const [checked, { title = "", ...rest }] = call.args([cells, options]) as [
      Cell[],
      RecordOptions,
    ];
    const name = this.#name("record");
    const node = this.#scene.addNode("record", title, rest, title ? {} : { id: name });
    for (const cell of checked) {
      const [label, o] = typeof cell === "string" ? [cell, {}] : cell;
      const { span = 1, ...options } = typeof o === "number" ? { span: o } : o;
      this.#member(node, label, options, { kind: "cell", span });
    }
    call.done([node]);
    return node;
  }
  /**
   * A member's id is its parent's, then its own from the first tab-separated column of its
   * label, such as `users.team_id`. The parent's part is joined in once it is final.
   */
  #member(parent: Node, label: string, options: MemberOptions, place: Place) {
    const { id, pin, ...rest } = options;
    const base = id ?? slug(label.split("\t")[0] ?? "");
    let own = base;
    for (let n = 2; parent.members.some((m) => m.membership?.own === own); n++)
      own = `${base}-${n}`;
    this.#scene.addNode(
      place.kind,
      label,
      { ...rest, mono: parent.options.mono ?? false },
      {
        id: `${parent.id}.${own}`,
        explicit: id !== undefined,
        membership: { ...place, parent, own, ...(pin !== undefined ? { pin } : {}) },
      },
    );
  }
  /**
   * A sequence diagram: the participants in a row, lifelines, and messages in time order.
   * Returns one element that can be placed like any other.
   */
  sequence(participants: Node[], steps: SequenceStep[], options: SequenceOptions = {}): Element {
    const call = this.#check(signatures.sequence);
    const [p, s, o] = call.args([participants, steps, options]) as [
      Node[],
      SequenceStep[],
      SequenceOptions,
    ];
    return sequence(this.#scene, call, p, s, o, this.#name("sequence"));
  }
  /**
   * A tree: the root over its subtrees, joined by lines. A child is a node or `[node, children]`.
   * Returns the outermost row or column, which can be placed like any other element.
   */
  tree(root: Node, children: TreeChild[], options: TreeOptions = {}): Grid {
    const call = this.#check(signatures.tree);
    const [node, c, o] = call.args([root, children, options]) as [
      Node | undefined,
      TreeChild[],
      TreeOptions,
    ];
    if (node) return tree(this.#scene, call, node, c, o);
    const empty = this.#scene.addGrid("column", [], {}, "tree");
    call.done([empty]);
    return empty;
  }
  /** A titled region between two corners, such as a UML fragment. */
  frame(from: PointLike, to: PointLike, options: FrameOptions = {}): Frame {
    const call = this.#check(signatures.frame);
    const [a, b, o] = call.args([from, to, options]) as [PointLike, PointLike, FrameOptions];
    const frame = this.#scene.addFrame(a, b, o, this.#name("frame"));
    call.done([frame]);
    return frame;
  }

  /**
   * Cells on shared tracks: each column as wide as its widest cell, each row as tall as its
   * tallest. `null` is an empty cell. Gutters between the tracks carry edges.
   */
  grid(rows: Array<Array<Element | null>>, options: GridOptions = {}): Grid {
    const call = this.#check(signatures.grid);
    const [cells, o] = call.args([rows, options]) as [Array<Array<Element | null>>, GridOptions];
    const grid = this.#scene.addGrid("grid", cells, o, this.#name("grid"));
    call.done([grid]);
    return grid;
  }
  /** Left to right: a grid of one row. `align` places the children vertically. */
  row(children: Element[], options: LineOptions = {}): Grid {
    const call = this.#check(signatures.row);
    const [cells, { gap = defaultGap.x, ...rest }] = call.args([children, options]) as [
      Element[],
      LineOptions,
    ];
    const name = this.#name("row");
    const row = this.#scene.addGrid("row", [cells], { ...rest, gap: [gap, defaultGap.y] }, name);
    call.done([row]);
    return row;
  }
  /** Top to bottom: a grid of one column. `align` places the children horizontally. */
  column(children: Element[], options: LineOptions = {}): Grid {
    const call = this.#check(signatures.column);
    const [cells, { gap = defaultGap.y, ...rest }] = call.args([children, options]) as [
      Element[],
      LineOptions,
    ];
    const rows = cells.map((child) => [child]);
    const name = this.#name("column");
    const column = this.#scene.addGrid("column", rows, { ...rest, gap: [defaultGap.x, gap] }, name);
    call.done([column]);
    return column;
  }

  /**
   * Position an element next to another or with an anchor at a point. Without exactly one of
   * `below`, `above`, `leftOf`, `rightOf`, and `at`, the placement is ignored.
   */
  place(el: Element, options: PlaceOptions): Element {
    const call = this.#check(signatures.place);
    const [target, o] = call.args([el, options]) as [Element | undefined, PlaceOptions];
    const where = placement(o);
    if (target && where) this.#scene.own(target, where);
    call.done(target ? [target] : []);
    return el;
  }

  enclose(members: Element[], options: EncloseOptions = {}): Enclosure {
    const call = this.#check(signatures.enclose);
    const [m, o] = call.args([members, options]) as [Element[], EncloseOptions];
    const enclosure = this.#scene.addEnclosure(m, o, this.#name("enclosure"));
    if (o.titleAt !== undefined && !o.title)
      call.ignore(
        "titleAt",
        o.titleAt,
        () => `titleAt is ${quote(o.titleAt)}, but the enclosure has no title.`,
      );
    call.done([enclosure]);
    return enclosure;
  }

  /**
   * An edge with `head: "filled"` and `tail: "none"` unless the options say otherwise. A string
   * third argument is its label. `d.arrow(a, a)` draws a self-loop.
   */
  arrow(from: PointLike, to: PointLike, options: string | EdgeOptions = {}): Edge {
    return this.#edge(signatures.arrow, from, to, options, {});
  }
  /** An edge with `head: "none"` and `tail: "none"` unless the options say otherwise. */
  line(from: PointLike, to: PointLike, options: string | EdgeOptions = {}): Edge {
    return this.#edge(signatures.line, from, to, options, { head: "none" });
  }
  /**
   * An edge of the author's, over the call's defaults. With an end it cannot use it is left out,
   * and a route it cannot take is replaced.
   */
  #edge(
    signature: Signature,
    from: unknown,
    to: unknown,
    options: unknown,
    defaults: EdgeOptions,
  ): Edge {
    const call = this.#check(signature);
    const [a, b, o] = call.args([from, to, options]) as [
      PointLike?,
      PointLike?,
      (string | EdgeOptions)?,
    ];
    const given = typeof o === "string" ? { label: o } : (o ?? {});
    const full = { ...defaults, ...given };
    if (!a || !b) {
      call.done([], [from, to].filter(isNamed));
      return new Edge(from as PointLike, to as PointLike, full);
    }
    const self = isSelfEdge(a, b);
    const route = given.route;
    const fits = route === undefined || (typeof route === "object" && "loop" in route) === self;
    const edge = this.#scene.addEdge(a, b, fits ? full : { ...full, route: defaultRoute(a, b) });
    if (!fits)
      call.replace("route", route, () =>
        self
          ? `route is ${quote(route)}, but the edge goes from ${elementOf(a)?.id} to itself and takes only { loop: side }. { loop: "right" } stands in.`
          : `route is ${quote(route)}, but only an edge from an element to itself takes { loop: side }. "straight" stands in.`,
      );
    call.done([edge]);
    return edge;
  }

  /** Give these nodes the largest measured width and height among them. */
  equalSize(nodes: Node[]) {
    this.#sizeGroup(signatures.equalSize, nodes, true, true);
  }
  equalWidth(nodes: Node[]) {
    this.#sizeGroup(signatures.equalWidth, nodes, true, false);
  }
  equalHeight(nodes: Node[]) {
    this.#sizeGroup(signatures.equalHeight, nodes, false, true);
  }
  /** A size group of the shapes in `nodes`; anything else is reported and left out. */
  #sizeGroup(signature: Signature, nodes: unknown, width: boolean, height: boolean) {
    const call = this.#check(signature);
    const [members] = call.args([nodes]) as [Node[]];
    this.#scene.addSizeGroup({ members, width, height });
    call.done();
  }

  point(x: number, y: number): Point {
    const call = this.#check(signatures.point);
    const [px, py] = call.args([x, y]) as [number, number];
    call.done();
    return new Point({ k: "abs", x: px, y: py }, this.#scene.checkArgs);
  }
  /** The x coordinate of `x` combined with the y coordinate of `y`. */
  xy(x: PointLike, y: PointLike): Point {
    const call = this.#check(signatures.xy);
    const [px, py] = call.args([x, y]) as [PointLike, PointLike];
    call.done();
    return new Point(xy(px, py).expr, this.#scene.checkArgs);
  }
  /** Linear interpolation: t = 0 at a, 1 at b. */
  lerp(a: PointLike, b: PointLike, t = 0.5): Point {
    const call = this.#check(signatures.lerp);
    const [pa, pb, at] = call.args([a, b, t]) as [PointLike, PointLike, number];
    call.done();
    return new Point(lerp(pa, pb, at).expr, this.#scene.checkArgs);
  }
}

/** The placement that checked `place` options state: next to an element, or at a point. */
function placement(options: PlaceOptions): Placement | undefined {
  for (const dir of Object.keys(directions) as Array<keyof typeof directions>) {
    const ref = options[dir];
    if (ref)
      return {
        kind: "relative",
        dir,
        ref,
        gap: options.gap ?? defaultGap[directions[dir]],
        align: options.align ?? "center",
      };
  }
  if (options.at) return { kind: "at", at: options.at, anchor: options.anchor ?? "center" };
}
