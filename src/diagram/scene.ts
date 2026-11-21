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
  type MethodCheck,
  type Named,
  Node,
  type NodeInternals,
  type Placement,
  type PointLike,
  type Reporter,
  type Shape,
} from "./elements.ts";
import { CallCheck } from "./signature.ts";
import { signatures } from "./signatures.ts";

/** The most elements a drawing may have, so that the checks, which compare pairs, stay fast. */
const maxElements = 2000;

/** An id that is its owner's final id followed by a suffix, such as `api-lifeline`. */
export interface DerivedId {
  owner: Element;
  suffix: string;
}

/** A problem a call found, with the elements it is about and its message, written later. */
interface Problem {
  code: DiagnosticCode;
  about: Named[];
  message: () => string;
  subject?: string;
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
  readonly #problems: Problem[] = [];
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
    node.report = this.report;
    node.checkArgs = this.checkArgs;
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
    edge.checkArgs = this.checkArgs;
    this.#edges.push(edge);
    this.#noteCategory(edge.category);
    return edge;
  }
  /**
   * A grid, a row, or a column, which owns its cells' positions; a cell it cannot position is
   * left empty. `name` is its id without an `id`, such as `row-1`, and defaults to its kind.
   */
  addGrid(
    kind: Grid["kind"],
    rows: Array<Array<Element | null>>,
    options: GridOptions,
    name: string = kind,
  ): Grid {
    this.#grow();
    const cells = rows.map((row) => row.map((cell) => (cell && placeable(cell) ? cell : null)));
    const grid = new Grid(kind, cells, options, name);
    grid.report = this.report;
    grid.checkArgs = this.checkArgs;
    this.#grids.push(grid);
    for (const child of rows.flat()) if (child) this.own(child, grid);
    return grid;
  }
  /** An enclosure; `name` is its id without an `id` or a title, such as `enclosure-1`. */
  addEnclosure(members: Element[], options: EncloseOptions, name = "enclosure"): Enclosure {
    this.#grow();
    const enclosure = new Enclosure(members, options, name);
    enclosure.checkArgs = this.checkArgs;
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

  /**
   * Give an element its position owner. An element whose bounds come from elsewhere, or that
   * has an owner already, is reported and keeps its bounds or its first owner.
   */
  own(el: Element, owner: Grid | Placement) {
    if (!placeable(el)) {
      this.report("NOT_PLACEABLE", [el], () => {
        const parent = el instanceof Node ? el.member?.parent : undefined;
        const what = parent
          ? `a ${el instanceof Node ? el.shape : "member"} of ${parent.id}; its bounds come from its parent. Position ${parent.id} instead.`
          : "an enclosure; its bounds come from its members. Position the members instead.";
        return `${ownerName(owner)} positions ${el.id}, which is ${what}`;
      });
      return;
    }
    const existing = this.#owner.get(el);
    if (existing) {
      this.report(
        "CONFLICTING_PLACEMENT",
        [el],
        () =>
          `${el.id} is positioned by both ${ownerName(existing)} and ${ownerName(owner)}. Each element has one position owner.`,
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
  /** Check a method's arguments against its signature, and report its problems about `self`. */
  readonly checkArgs: MethodCheck = (self, method, given) => {
    const call = new CallCheck(this.report, signatures[method]);
    const args = call.args(given);
    call.done(self ? [self] : []);
    return args;
  };
  /** Report a problem about elements. Its message is written when the diagnostics are read. */
  report: Reporter = (code, about, message, subject) => {
    this.#problems.push({ code, about, message, ...(subject !== undefined ? { subject } : {}) });
  };
  /**
   * The problems the calls reported, written from the elements' ids as they are now. The
   * compiler reads them once, after the id check, so they name final ids.
   */
  diagnostics(): Diagnostic[] {
    return this.#problems.map(({ code, about, message, subject }) => ({
      code,
      message: message(),
      ids: about.map((el) => el.id),
      ...(subject !== undefined ? { subject } : {}),
    }));
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

/** Whether a grid or a placement can position an element: not an enclosure, a cell, or a mark. */
function placeable(el: Element): boolean {
  return !(el instanceof Enclosure) && !(el instanceof Node && el.member);
}

/** How a message names a position owner: `row(row-1)` or `place()`. */
function ownerName(owner: Grid | Placement): string {
  return owner instanceof Grid ? `${owner.kind}(${owner.id})` : "place()";
}
