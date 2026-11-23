/**
 * Trees from the diagram primitives: each subtree is a row or column of its root and its
 * children's subtrees, with lines from the root to each child that share one trunk.
 */
import {
  type Align,
  type EdgeOptions,
  type Element,
  type Grid,
  type GridOptions,
  Node,
  type PointLike,
  type Route,
} from "./elements.ts";
import { defaultGap, treeSpacing } from "./metrics.ts";
import type { Scene } from "./scene.ts";
import { type CallCheck, quote } from "./signature.ts";

/** How a tree grows: down, to the right, to both sides, or as an indented list. */
export type TreeLayout = "down" | "right" | "both" | "indent";

/** The options of one line of a tree: its label alone, or its label and style. */
export type TreeEdge = string | Omit<EdgeOptions, "id" | "route">;

/** A child whose line into it has its own label or style, with any children of its own. */
export interface TreeBranch {
  node: Node;
  /** The line from the parent into this node. */
  edge: TreeEdge;
  children?: TreeChild[];
}

/** A child in a tree: a leaf, a node with its own children, or a branch with its own line. */
export type TreeChild = Node | [node: Node, children: TreeChild[]] | TreeBranch;

/** Options of a tree. */
export interface TreeOptions {
  /** The outermost branch's id. Default: the root's id followed by `-tree`. */
  id?: string;
  /** Default: down. */
  layout?: TreeLayout;
  /** Space between siblings. Default: 24. */
  gap?: number;
  /** Space between a parent and its children. Default: 48. `indent` uses `gap` instead. */
  levelGap?: number;
  /** Options of every line, such as `tail`, `dashed`, or `role`. Lines have no heads by default. */
  edge?: Omit<EdgeOptions, "id" | "label" | "route">;
}

/** The direction one subtree grows in; `left` is `right` mirrored, for the left half of `both`. */
type Growth = "down" | "right" | "left" | "indent";

/** Where the line to the `i`th child starts, and its route. */
type Branch = (i: number) => [PointLike, Route];

/**
 * Draw a tree into the scene and return the row or column that holds it all. `call` checked
 * the arguments and reports about the outermost branch.
 */
export function tree(
  scene: Scene,
  call: CallCheck,
  root: Node,
  children: TreeChild[],
  options: TreeOptions,
): Grid {
  const layout = options.layout ?? "down";
  const outermost = grown(scene, call, root, children, options, layout);
  if (layout === "indent" && options.levelGap !== undefined)
    call.ignore(
      "levelGap",
      options.levelGap,
      () =>
        `levelGap is ${quote(options.levelGap)}, but the indent layout uses gap between levels.`,
    );
  call.done([outermost]);
  return outermost;
}

/**
 * The tree in a known layout. Each branch is named after its node: `-tree`, with its subtrees
 * in `-children`, or `-left` and `-right`.
 */
function grown(
  scene: Scene,
  call: CallCheck,
  root: Node,
  children: TreeChild[],
  options: TreeOptions,
  layout: TreeLayout,
): Grid {
  const gap = options.gap ?? treeSpacing.gap;
  const levelGap = options.levelGap ?? treeSpacing.levelGap;
  const outer: GridOptions = options.id !== undefined ? { id: options.id } : {};
  const row = (cells: Element[], cellGap: number, align: Align = "center", o: GridOptions = {}) =>
    scene.addGrid("row", [cells], { ...o, gap: [cellGap, defaultGap.y], align });
  const column = (
    cells: Element[],
    cellGap: number,
    align: Align = "center",
    o: GridOptions = {},
  ) =>
    scene.addGrid(
      "column",
      cells.map((cell) => [cell]),
      { ...o, gap: [defaultGap.x, cellGap], align },
    );
  const reported = new WeakSet<TreeBranch>();
  const split = (child: TreeChild): [Node, TreeChild[], TreeEdge?] => {
    if (Array.isArray(child)) return child;
    if (child instanceof Node) return [child, []];
    if (child.edge === undefined && !reported.has(child)) {
      reported.add(child);
      noEdge(call, child);
    }
    return [child.node, child.children ?? [], child.edge];
  };
  const lineOptions = (own: TreeEdge | undefined): EdgeOptions => ({
    head: "none",
    ...options.edge,
    ...(typeof own === "string" ? { label: own } : own),
  });
  const named = (grid: Grid, owner: Node, suffix: string) => {
    scene.nameAfter(grid, owner, suffix);
    return grid;
  };

  const join = (
    container: Grid,
    parent: Node,
    kids: TreeChild[],
    branch: Branch,
    labelBeforeEnd = levelGap / 4,
  ) => {
    scene.nameAfter(container, parent, "-tree");
    const lines = kids.map((kid, i) => {
      const [from, route] = branch(i);
      const [node, , own] = split(kid);
      return scene.addEdge(from, node, { ...lineOptions(own), route }, { labelBeforeEnd });
    });
    scene.addGroup(container, lines);
    return container;
  };
  const side = (kids: TreeChild[], growth: "left" | "right") =>
    column(
      kids.map((kid) => subtree(kid, growth)),
      gap,
      growth === "left" ? "end" : "start",
    );
  const subtree = (kid: TreeChild, growth: Growth): Element => {
    const [node, kids] = split(kid);
    return kids.length ? grow(node, kids, growth) : node;
  };
  const grow = (node: Node, kids: TreeChild[], growth: Growth, o: GridOptions = {}): Grid => {
    const subtrees = () => kids.map((kid) => subtree(kid, growth));
    switch (growth) {
      case "down": {
        const below = named(row(subtrees(), gap, "start"), node, "-children");
        const levels = column([node, below], levelGap, "center", o);
        return join(levels, node, kids, () => [node, { viaY: levels.gutterY(0) }]);
      }
      case "right":
      case "left": {
        const subtreeColumn = named(side(kids, growth), node, "-children");
        const cells = growth === "left" ? [subtreeColumn, node] : [node, subtreeColumn];
        const levels = row(cells, levelGap, "center", o);
        return join(levels, node, kids, () => [node, { viaX: levels.gutterX(0) }]);
      }
      case "indent": {
        const indented = scene.addGrid(
          "grid",
          subtrees().map((s) => [null, s]),
          { gap: [treeSpacing.indent, gap], align: "start" },
        );
        named(indented, node, "-children");
        const levels = column([node, indented], gap, "start", o);
        const trunk = node.bottomLeft.offset(treeSpacing.trunk, 0);
        const stub = (treeSpacing.indent - treeSpacing.trunk) / 2;
        return join(levels, node, kids, () => [trunk, "vh"], stub);
      }
    }
  };

  if (children.length === 0)
    return join(column([root], defaultGap.y, "center", outer), root, [], () => [root, "straight"]);
  if (layout !== "both") return grow(root, children, layout, outer);
  const lefts = children.filter((_, i) => i % 2 === 1);
  const rights = children.filter((_, i) => i % 2 === 0);
  const cells = [
    ...(lefts.length ? [named(side(lefts, "left"), root, "-left")] : []),
    root,
    named(side(rights, "right"), root, "-right"),
  ];
  const halves = row(cells, levelGap, "center", outer);
  const at = cells.indexOf(root);
  return join(halves, root, children, (i) => [root, { viaX: halves.gutterX(i % 2 ? 0 : at) }]);
}

/** Report a branch object with no `edge`, which says nothing that `[node, children]` does not. */
function noEdge(call: CallCheck, branch: TreeBranch) {
  const path = call.pathOf(branch);
  call.replace(
    path,
    branch,
    () => `${path} has no edge. Write [node, children] for a child whose line has no options.`,
  );
}
