/**
 * The object a draw program receives as `d`: the documented calls, each of which records
 * elements in a scene. Nothing is measured or positioned here; `compile` resolves geometry later.
 */
import {
  type BoxOptions,
  type Cell,
  type Edge,
  type EdgeOptions,
  type Element,
  type EncloseOptions,
  type Enclosure,
  type Frame,
  type FrameOptions,
  type Grid,
  type GridOptions,
  type LineOptions,
  lerp,
  type Mark,
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
import { type TreeChild, type TreeOptions, tree } from "./tree.ts";

/**
 * The author's calls. Its only state is the scene it records into, which a draw program
 * cannot reach.
 */
export class DiagramBuilder {
  readonly #scene: Scene;
  constructor(scene: Scene) {
    this.#scene = scene;
  }

  /** A component, service, or step: a rectangle fitted around its text. */
  box(label: string, options: BoxOptions = {}): Node {
    return this.#stacked("box", label, options);
  }
  /** Storage: a database, a cache. */
  cylinder(label: string, options: NodeOptions = {}): Node {
    return this.#scene.addNode("cylinder", label, options);
  }
  /** Input or output of a flow: a parallelogram around its text. */
  io(label: string, options: NodeOptions = {}): Node {
    return this.#scene.addNode("io", label, options);
  }
  /** A document, a report, a file: a page with a wavy bottom. */
  doc(label: string, options: StackOptions = {}): Node {
    return this.#stacked("doc", label, options);
  }
  /** A queue, a topic, a stream: a cylinder on its side. */
  queue(label: string, options: NodeOptions = {}): Node {
    return this.#scene.addNode("queue", label, options);
  }
  /** Free-standing text without an outline. `marks` name spans or lines as members. */
  text(label: string, options: TextOptions = {}): Node {
    const { marks, ...rest } = options;
    const node = this.#scene.addNode("text", label, rest);
    for (const [id, mark] of Object.entries(marks ?? {})) {
      const { text, lines, ...o } =
        typeof mark === "string"
          ? { text: mark }
          : (mark as Mark & { text?: string; lines?: string });
      const place: Place =
        text !== undefined ? { kind: "mark", text } : { kind: "mark", lines: lines ?? "" };
      this.#member(node, text ?? "", { ...o, id }, place);
    }
    return node;
  }
  /** A person or outside system that acts: a figure above its name. */
  actor(label: string, options: NodeOptions = {}): Node {
    return this.#scene.addNode("actor", label, options);
  }
  /**
   * A thing drawn as a picture, such as a user, a cloud, or a server: a Lucide icon, named
   * without a prefix, above its label.
   */
  icon(name: string, label: string, options: NodeOptions = {}): Node {
    return this.#scene.addNode("icon", label, { ...options, icon: name });
  }
  /** An annotation with a folded corner. */
  note(label: string, options: NodeOptions = {}): Node {
    return this.#scene.addNode("note", label, options);
  }
  /** A decision: a diamond around a short question. */
  decision(label: string, options: NodeOptions = {}): Node {
    return this.#scene.addNode("diamond", label, options);
  }
  /**
   * A start point: a filled dot. A label, such as the event that starts the flow, sits
   * outside the dot and does not move it: layout and gaps use the dot alone.
   */
  start(label = "", options: TerminalOptions = {}): Node {
    return this.#terminal("dot", "start", label, options);
  }
  /** An end point: a ringed dot, with an optional label outside it, as for `start`. */
  end(label = "", options: TerminalOptions = {}): Node {
    return this.#terminal("ring", "end", label, options);
  }
  /** A box or document, alone or as a stack of 2 to 4. Any other count draws it alone. */
  #stacked(shape: "box" | "doc", label: string, options: StackOptions): Node {
    const { replicas, ...rest } = options;
    const valid =
      typeof replicas === "number" && Number.isInteger(replicas) && replicas >= 2 && replicas <= 4;
    const node = this.#scene.addNode(shape, label, valid ? options : rest);
    if (replicas !== undefined && !valid) {
      const what = shape === "box" ? "boxes" : "pages";
      this.#scene.report(
        "INVALID_REPLICAS",
        `${node.id} has replicas: ${JSON.stringify(replicas)}, but a stack draws 2 to 4 ${what}. For more, or an unknown number, put the number in the label of a ${shape} with replicas: 4.`,
        [node.id],
      );
    }
    return node;
  }
  #terminal(shape: Shape, kind: string, label: string, options: TerminalOptions): Node {
    const id = label ? {} : { id: `${kind}-${this.#scene.nodes.length + 1}` };
    return this.#scene.addNode(shape, label, options, id);
  }
  /**
   * Cells on a grid under an optional title: a type, a table, a packet header, a register,
   * an array. Each cell is a member: `rec.element("id")`.
   */
  record(cells: Cell[], options: RecordOptions = {}): Node {
    const { title = "", ...rest } = options;
    const n = this.#scene.nodes.filter((x) => x.shape === "record").length + 1;
    const node = this.#scene.addNode("record", title, rest, title ? {} : { id: `record-${n}` });
    for (const cell of cells) {
      const [label, o] = typeof cell === "string" ? [cell, {}] : cell;
      const { span = 1, ...options } = typeof o === "number" ? { span: o } : o;
      this.#member(node, label, options, { kind: "cell", span: Math.max(1, Math.round(span)) });
    }
    return node;
  }
  /**
   * A member's id is its parent's, then its own from the first tab-separated column of its
   * label, such as `users.team-id`. The parent's part is joined in once it is final.
   */
  #member(parent: Node, label: string, options: MemberOptions, place: Place) {
    const { id, pin, ...rest } = options;
    const base = id ?? slug(label.split("\t")[0] ?? "");
    let own = base;
    for (let n = 2; parent.members.some((m) => m.member?.own === own); n++) own = `${base}-${n}`;
    this.#scene.addNode(
      place.kind,
      label,
      { ...rest, mono: parent.options.mono ?? false },
      {
        id: `${parent.id}.${own}`,
        explicit: id !== undefined,
        member: { ...place, parent, own, ...(pin !== undefined ? { pin } : {}) },
      },
    );
  }
  /**
   * A sequence diagram: the participants in a row, lifelines, and messages in time order.
   * Returns one element that can be placed like any other.
   */
  sequence(participants: Node[], steps: SequenceStep[], options: SequenceOptions = {}): Element {
    return sequence(this.#scene, participants, steps, options);
  }
  /**
   * A tree: the root over its subtrees, joined by lines. A child is a node or `[node, children]`.
   * Returns the outermost row or column, which can be placed like any other element.
   */
  tree(root: Node, children: TreeChild[], options: TreeOptions = {}): Grid {
    return tree(this.#scene, root, children, options);
  }
  /** A titled region between two corners, such as a UML fragment. */
  frame(from: PointLike, to: PointLike, options: FrameOptions = {}): Frame {
    return this.#scene.addFrame(from, to, options);
  }

  /**
   * Cells on shared tracks: each column as wide as its widest cell, each row as tall as its
   * tallest. `null` is an empty cell. Gutters between the tracks carry edges.
   */
  grid(rows: Array<Array<Element | null>>, options: GridOptions = {}): Grid {
    return this.#scene.addGrid("grid", rows, options);
  }
  /** Left to right: a grid of one row. `align` places the children vertically. */
  row(children: Element[], options: LineOptions = {}): Grid {
    const { gap = defaultGap.x, ...rest } = options;
    return this.#scene.addGrid("row", [children], { ...rest, gap: [gap, defaultGap.y] });
  }
  /** Top to bottom: a grid of one column. `align` places the children horizontally. */
  column(children: Element[], options: LineOptions = {}): Grid {
    const { gap = defaultGap.y, ...rest } = options;
    const rows = children.map((child) => [child]);
    return this.#scene.addGrid("column", rows, { ...rest, gap: [defaultGap.x, gap] });
  }

  place(el: Element, options: PlaceOptions): Element {
    const dirs = (["below", "above", "leftOf", "rightOf"] as const).filter((d) => options[d]);
    const count = dirs.length + (options.at ? 1 : 0);
    if (count !== 1) {
      this.#scene.report(
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
    this.#scene.own(el, placement, "place()");
    return el;
  }

  enclose(members: Element[], options: EncloseOptions = {}): Enclosure {
    return this.#scene.addEnclosure(members, options);
  }

  /** An arrow. A string third argument is its label. `d.arrow(a, a)` draws a self-loop. */
  arrow(from: PointLike, to: PointLike, options: string | EdgeOptions = {}): Edge {
    return this.#scene.addEdge(
      from,
      to,
      typeof options === "string" ? { label: options } : options,
    );
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
    this.#scene.addSizeGroup({ members: nodes, width: true, height: true });
  }
  equalWidth(nodes: Node[]) {
    this.#scene.addSizeGroup({ members: nodes, width: true, height: false });
  }
  equalHeight(nodes: Node[]) {
    this.#scene.addSizeGroup({ members: nodes, width: false, height: true });
  }

  point(x: number, y: number): Point {
    return new Point({ k: "abs", x, y });
  }
  /** The x coordinate of `x` combined with the y coordinate of `y`. */
  xy(x: PointLike, y: PointLike): Point {
    return xy(x, y);
  }
  /** Linear interpolation: t = 0 at a, 1 at b. */
  lerp(a: PointLike, b: PointLike, t = 0.5): Point {
    return lerp(a, b, t);
  }
}
