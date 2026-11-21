/**
 * The authoring API: `DiagramBuilder` creates the handles and records their relationships.
 * Nothing is measured or positioned here; `compile` resolves geometry later.
 */
import type { DiagnosticCode } from "../document/diagnostic.ts";
import {
  type Cell,
  type Diagnostic,
  Edge,
  type EdgeOptions,
  type Element,
  type EncloseOptions,
  Enclosure,
  Frame,
  type FrameOptions,
  Grid,
  type GridOptions,
  type LineOptions,
  type Mark,
  type MemberOptions,
  Node,
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
  toExpr,
} from "./elements.ts";
import { defaultGap } from "./metrics.ts";
import { type SequenceOptions, type SequenceStep, sequence } from "./sequence.ts";

/** The most elements a drawing may have, so that the checks, which compare pairs, stay fast. */
const maxElements = 2000;

/** The scene an author's diagram function builds: its elements, relations, and diagnostics. */
export class DiagramBuilder {
  readonly nodes: Node[] = [];
  readonly grids: Grid[] = [];
  readonly enclosures: Enclosure[] = [];
  readonly edges: Edge[] = [];
  readonly frames: Frame[] = [];
  readonly owner = new Map<Element, Grid | Placement>();
  readonly sizeGroups: Array<{ members: Node[]; width: boolean; height: boolean }> = [];
  /**
   * Elements a step focuses together with a container, beyond what it encloses or lays out:
   * a sequence's messages and notes, a fragment's messages.
   */
  readonly groups = new Map<Element | Frame, Array<Element | Edge | Frame>>();
  readonly diagnostics: Diagnostic[] = [];
  /** Categories in the order the drawing first uses them, which sets their colors. */
  readonly categories: string[] = [];

  /** A component, service, or step: a rectangle fitted around its text. */
  box(label: string, options: StackOptions = {}): Node {
    return this.stacked("box", label, options);
  }
  /** Storage: a database, a cache. */
  cylinder(label: string, options: NodeOptions = {}): Node {
    return this.add(new Node("cylinder", label, options));
  }
  /** Input or output of a flow: a parallelogram around its text. */
  io(label: string, options: NodeOptions = {}): Node {
    return this.add(new Node("io", label, options));
  }
  /** A document, a report, a file: a page with a wavy bottom. */
  doc(label: string, options: StackOptions = {}): Node {
    return this.stacked("doc", label, options);
  }
  /** A queue, a topic, a stream: a cylinder on its side. */
  queue(label: string, options: NodeOptions = {}): Node {
    return this.add(new Node("queue", label, options));
  }
  /** Free-standing text without an outline. `marks` name spans or lines as members. */
  text(label: string, options: TextOptions = {}): Node {
    const { marks, ...rest } = options;
    const node = this.add(new Node("text", label, rest));
    for (const [id, mark] of Object.entries(marks ?? {})) {
      const { text, lines, ...o } =
        typeof mark === "string"
          ? { text: mark }
          : (mark as Mark & { text?: string; lines?: string });
      const place: Place =
        text !== undefined ? { kind: "mark", text } : { kind: "mark", lines: lines ?? "" };
      this.member(node, text ?? "", { ...o, id }, place);
    }
    return node;
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
  /** A box or document, alone or as a stack of 2 to 4. Any other count draws it alone. */
  private stacked(shape: "box" | "doc", label: string, options: StackOptions): Node {
    const { replicas, ...rest } = options;
    const valid =
      typeof replicas === "number" && Number.isInteger(replicas) && replicas >= 2 && replicas <= 4;
    const node = this.add(new Node(shape, label, valid ? options : rest));
    if (replicas !== undefined && !valid) {
      const what = shape === "box" ? "boxes" : "pages";
      this.report(
        "INVALID_REPLICAS",
        `${node.id} has replicas: ${JSON.stringify(replicas)}, but a stack draws 2 to 4 ${what}. For more, or an unknown number, put the number in the label of a ${shape} with replicas: 4.`,
        [node.id],
      );
    }
    return node;
  }
  private terminal(shape: Shape, kind: string, label: string, options: TerminalOptions): Node {
    const node = new Node(shape, label, options, {
      ...(label ? {} : { id: `${kind}-${this.nodes.length + 1}` }),
    });
    return this.add(node);
  }
  /**
   * Cells on a grid under an optional title: a type, a table, a packet header, a register,
   * an array. Each cell is a member: `rec.element("id")`.
   */
  record(cells: Cell[], options: RecordOptions = {}): Node {
    const { title = "", ...rest } = options;
    const n = this.nodes.filter((x) => x.shape === "record").length + 1;
    const node = this.add(new Node("record", title, rest, title ? {} : { id: `record-${n}` }));
    for (const cell of cells) {
      const [label, o] = typeof cell === "string" ? [cell, {}] : cell;
      const { span = 1, ...options } = typeof o === "number" ? { span: o } : o;
      this.member(node, label, options, { kind: "cell", span: Math.max(1, Math.round(span)) });
    }
    return node;
  }
  /**
   * A member's id is its parent's, then its own from the first tab-separated column of its
   * label, such as `users.team-id`. The parent's part is joined in once it is final.
   */
  private member(parent: Node, label: string, options: MemberOptions, place: Place) {
    const { id, pin, ...rest } = options;
    const base = id ?? slug(label.split("\t")[0] ?? "");
    let own = base;
    for (let n = 2; parent.members.some((m) => m.member?.own === own); n++) own = `${base}-${n}`;
    const node = new Node(
      place.kind,
      label,
      { ...rest, mono: parent.options.mono ?? false },
      {
        id: `${parent.id}.${own}`,
        explicit: id !== undefined,
        member: { ...place, parent, own, ...(pin !== undefined ? { pin } : {}) },
      },
    );
    parent.members.push(node);
    this.add(node);
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
    this.grow();
    const frame = new Frame(from, to, options, this.frames.length + 1);
    this.frames.push(frame);
    return frame;
  }

  /**
   * Cells on shared tracks: each column as wide as its widest cell, each row as tall as its
   * tallest. `null` is an empty cell. Gutters between the tracks carry edges.
   */
  grid(rows: Array<Array<Element | null>>, options: GridOptions = {}): Grid {
    return this.layout("grid", rows, options);
  }
  /** Left to right: a grid of one row. `align` places the children vertically. */
  row(children: Element[], options: LineOptions = {}): Grid {
    const { gap = defaultGap.x, ...rest } = options;
    return this.layout("row", [children], { ...rest, gap: [gap, defaultGap.y] });
  }
  /** Top to bottom: a grid of one column. `align` places the children horizontally. */
  column(children: Element[], options: LineOptions = {}): Grid {
    const { gap = defaultGap.y, ...rest } = options;
    const rows = children.map((child) => [child]);
    return this.layout("column", rows, { ...rest, gap: [defaultGap.x, gap] });
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
            gap: options.gap ?? (dir === "below" || dir === "above" ? defaultGap.y : defaultGap.x),
            align: options.align ?? "center",
          }
        : { kind: "at", at: options.at ?? [0, 0], anchor: options.anchor ?? "center" };
    this.own(el, placement, "place()");
    return el;
  }

  enclose(members: Element[], options: EncloseOptions = {}): Enclosure {
    this.grow();
    const e = new Enclosure(members, options, this.enclosures.length + 1);
    this.enclosures.push(e);
    this.noteCategory(options.category);
    return e;
  }

  /** An arrow. A string third argument is its label. `d.arrow(a, a)` draws a self-loop. */
  arrow(from: PointLike, to: PointLike, options: string | EdgeOptions = {}): Edge {
    this.grow();
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

  /** Throws when the drawing already has the most elements it may have. */
  private grow() {
    const count =
      this.nodes.length +
      this.edges.length +
      this.frames.length +
      this.grids.length +
      this.enclosures.length;
    if (count >= maxElements) throw new Error(`The drawing has more than ${maxElements} elements.`);
  }
  private add(node: Node): Node {
    this.grow();
    node.report = (code, message, ids) => this.report(code, message, ids);
    this.nodes.push(node);
    this.noteCategory(node.options.category);
    return node;
  }
  private layout(kind: Grid["kind"], rows: Array<Array<Element | null>>, options: GridOptions) {
    this.grow();
    const g = new Grid(kind, rows, options, this.grids.length + 1);
    g.report = (code, message, ids) => this.report(code, message, ids);
    this.grids.push(g);
    for (const child of g.children) this.own(child, g, `${kind}(${g.id})`);
    return g;
  }
  private own(el: Element, owner: Grid | Placement, by: string) {
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
      const prior = existing instanceof Grid ? `${existing.kind}(${existing.id})` : "place()";
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
