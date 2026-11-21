/**
 * Trees from the diagram primitives: each subtree is a row or column of its root and its
 * children's subtrees, with lines from the root to each child that share one trunk.
 */
import type {
  Align,
  EdgeOptions,
  Element,
  Grid,
  GridOptions,
  Node,
  PointLike,
  Route,
} from "./elements.ts";
import { defaultGap, treeSpacing } from "./metrics.ts";
import type { Scene } from "./scene.ts";

/** How a tree grows: down, to the right, to both sides, or as an indented list. */
export type TreeLayout = "down" | "right" | "both" | "indent";

/** A child in a tree: a leaf, or a node with its own children. */
export type TreeChild = Node | [node: Node, children: TreeChild[]];

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
  /** Options of every line, such as `ends`, `dashed`, or `role`. */
  edge?: Omit<EdgeOptions, "id" | "label" | "route" | "bend" | "loop">;
}

/** The direction one subtree grows in; `left` is `right` mirrored, for the left half of `both`. */
type Growth = "down" | "right" | "left" | "indent";

/** Where the line to the `i`th child starts, and its route. */
type Branch = (i: number) => [PointLike, Route];

/** The layouts, to check one from a draw program, which has no types. */
const layouts: readonly TreeLayout[] = ["down", "right", "both", "indent"];

/**
 * Draw a tree into the scene and return the row or column that holds it all. Each branch is
 * named after its node: `-tree`, with its subtrees in `-children`, or `-left` and `-right`.
 */
export function tree(
  scene: Scene,
  root: Node,
  children: TreeChild[],
  options: TreeOptions = {},
): Grid {
  const layout = options.layout ?? "down";
  if (!layouts.includes(layout))
    throw new Error(`Tree layout "${layout}" is not one of ${layouts.join(", ")}.`);
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
  const split = (child: TreeChild): [Node, TreeChild[]] =>
    Array.isArray(child) ? child : [child, []];
  const named = (grid: Grid, owner: Node, suffix: string) => {
    scene.nameAfter(grid, owner, suffix);
    return grid;
  };

  const join = (container: Grid, parent: Node, kids: TreeChild[], branch: Branch) => {
    scene.nameAfter(container, parent, "-tree");
    const lines = kids.map((kid, i) => {
      const [from, route] = branch(i);
      return scene.addEdge(from, split(kid)[0], { ends: "--", ...options.edge, route });
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
        return join(levels, node, kids, () => [trunk, "vh"]);
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
