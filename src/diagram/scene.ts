/**
 * The scene a draw program records: its elements, position owners, size groups, groups,
 * categories, and diagnostics. Every element enters it through one function per kind.
 */
import type { DiagnosticCode } from "../document/diagnostic.ts";
import {
  type Diagnostic,
  Edge,
  type EdgeInternals,
  type EdgeOptions,
  type Element,
  type EncloseOptions,
  Enclosure,
  Frame,
  type FrameOptions,
  Grid,
  type GridOptions,
  Node,
  type NodeInternals,
  type Placement,
  type PointLike,
  type Shape,
} from "./elements.ts";

/** The most elements a drawing may have, so that the checks, which compare pairs, stay fast. */
const maxElements = 2000;

/** Anything with an id that the id check settles. */
export type Named = Element | Edge | Frame;

/** An id that is its owner's final id followed by a suffix, such as `api-lifeline`. */
export interface DerivedId {
  owner: Element;
  suffix: string;
}

/** Nodes that share the largest measured width, height, or both. */
export interface SizeGroup {
  members: Node[];
  width: boolean;
  height: boolean;
}

/**
 * The elements and relations that the compiler lays out. Adding an element applies the element
 * limit, registers its category, and lets it report diagnostics.
 */
export class Scene {
  readonly #nodes: Node[] = [];
  readonly #grids: Grid[] = [];
  readonly #enclosures: Enclosure[] = [];
  readonly #edges: Edge[] = [];
  readonly #frames: Frame[] = [];
  readonly #owner = new Map<Element, Grid | Placement>();
  readonly #sizeGroups: SizeGroup[] = [];
  readonly #groups = new Map<Element | Frame, Array<Element | Edge | Frame>>();
  readonly #diagnostics: Diagnostic[] = [];
  readonly #categories: string[] = [];
  readonly #derivedIds = new Map<Named, DerivedId>();

  get nodes(): readonly Node[] {
    return this.#nodes;
  }
  get grids(): readonly Grid[] {
    return this.#grids;
  }
  get enclosures(): readonly Enclosure[] {
    return this.#enclosures;
  }
  get edges(): readonly Edge[] {
    return this.#edges;
  }
  get frames(): readonly Frame[] {
    return this.#frames;
  }
  /** Each positioned element's one position owner: its grid or its placement. */
  get owner(): ReadonlyMap<Element, Grid | Placement> {
    return this.#owner;
  }
  get sizeGroups(): readonly SizeGroup[] {
    return this.#sizeGroups;
  }
  /**
   * Elements a step focuses together with a container, beyond what it encloses or lays out:
   * a sequence's messages and notes, a fragment's messages, a tree branch's lines.
   */
  get groups(): ReadonlyMap<Element | Frame, ReadonlyArray<Element | Edge | Frame>> {
    return this.#groups;
  }
  get diagnostics(): readonly Diagnostic[] {
    return this.#diagnostics;
  }
  /** Categories in the order the drawing first uses them, which sets their colors. */
  get categories(): readonly string[] {
    return this.#categories;
  }
  /** The elements whose ids the id check builds from their owners' final ids. */
  get derivedIds(): ReadonlyMap<Named, DerivedId> {
    return this.#derivedIds;
  }

  /** A node, with what only the library sets in `internals`. */
  addNode(
    shape: Shape,
    label: string,
    options: Node["options"],
    internals: NodeInternals = {},
  ): Node {
    this.#grow();
    const node = new Node(shape, label, options, internals);
    node.report = (code, message, ids) => this.report(code, message, ids);
    internals.member?.parent.members.push(node);
    this.#nodes.push(node);
    this.#noteCategory(node.options.category);
    return node;
  }
  /** An edge, with what only the library sets in `internals`. */
  addEdge(
    from: PointLike,
    to: PointLike,
    options: EdgeOptions,
    internals: EdgeInternals = {},
  ): Edge {
    this.#grow();
    const edge = new Edge(from, to, options, internals);
    this.#edges.push(edge);
    this.#noteCategory(edge.category);
    return edge;
  }
  /**
   * A grid, a row, or a column, which becomes the position owner of its cells. `name` is its
   * id without an `id`, such as `row-1`, and defaults to its kind, as for every add function.
   */
  addGrid(
    kind: Grid["kind"],
    rows: Array<Array<Element | null>>,
    options: GridOptions,
    name: string = kind,
  ): Grid {
    this.#grow();
    const grid = new Grid(kind, rows, options, name);
    grid.report = (code, message, ids) => this.report(code, message, ids);
    this.#grids.push(grid);
    for (const child of grid.children) this.own(child, grid, `${kind}(${grid.id})`);
    return grid;
  }
  /** An enclosure; `name` is its id without an `id` or a title, such as `enclosure-1`. */
  addEnclosure(members: Element[], options: EncloseOptions, name = "enclosure"): Enclosure {
    this.#grow();
    const enclosure = new Enclosure(members, options, name);
    this.#enclosures.push(enclosure);
    this.#noteCategory(options.category);
    return enclosure;
  }
  /** A frame; `name` is its id without an `id`, a tab, or a title, such as `frame-1`. */
  addFrame(from: PointLike, to: PointLike, options: FrameOptions, name = "frame"): Frame {
    this.#grow();
    const frame = new Frame(from, to, options, name);
    this.#frames.push(frame);
    return frame;
  }

  /** Give an element its position owner; a second owner or an enclosure is reported. */
  own(el: Element, owner: Grid | Placement, by: string) {
    if (el instanceof Enclosure) {
      this.report(
        "ENCLOSURE_PLACEMENT",
        `${el.id} is an enclosure; its bounds come from its members. Position the members instead.`,
        [el.id],
      );
      return;
    }
    const existing = this.#owner.get(el);
    if (existing) {
      const prior = existing instanceof Grid ? `${existing.kind}(${existing.id})` : "place()";
      this.report(
        "CONFLICTING_PLACEMENT",
        `${el.id} is positioned by both ${prior} and ${by}. Each element has one position owner.`,
        [el.id],
      );
      return;
    }
    this.#owner.set(el, owner);
  }
  /**
   * Name an element after its owner: its id becomes the owner's final id and `suffix`, settled
   * after the owner's. An element with an explicit id keeps it.
   */
  nameAfter(el: Named, owner: Element, suffix: string) {
    if (el.explicitId) return;
    el.id = `${owner.id}${suffix}`;
    this.#derivedIds.set(el, { owner, suffix });
  }
  addSizeGroup(group: SizeGroup) {
    this.#sizeGroups.push(group);
  }
  /** The elements that a step focuses together with `container`. */
  addGroup(container: Element | Frame, members: Array<Element | Edge | Frame>) {
    this.#groups.set(container, [...members]);
  }
  report(code: DiagnosticCode, message: string, ids: string[]) {
    this.#diagnostics.push({ code, message, ids });
  }

  #noteCategory(category: string | undefined) {
    if (category !== undefined && !this.#categories.includes(category))
      this.#categories.push(category);
  }
  /** Throws when the drawing already has the most elements it may have. */
  #grow() {
    const count =
      this.#nodes.length +
      this.#edges.length +
      this.#frames.length +
      this.#grids.length +
      this.#enclosures.length;
    if (count >= maxElements) throw new Error(`The drawing has more than ${maxElements} elements.`);
  }
}
