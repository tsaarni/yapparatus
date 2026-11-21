/**
 * Trees from the diagram primitives: each subtree is a row or column of its root and its
 * children's subtrees, with lines from the root to each child that share one trunk.
 */
import type { Align, EdgeOptions, Element, Grid, Node, PointLike, Route } from "./elements.ts";
import { defaultGap, treeSpacing } from "./metrics.ts";
import type { Scene } from "./scene.ts";

/** How a tree grows: down, to the right, to both sides, or as an indented list. */
export type TreeLayout = "down" | "right" | "both" | "indent";

/** A child in a tree: a leaf, or a node with its own children. */
export type TreeChild = Node | [node: Node, children: TreeChild[]];

/** Options of a tree. */
export interface TreeOptions {
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

/** Draw a tree into the scene and return the row or column that holds it all. */
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
  const row = (cells: Element[], cellGap: number, align: Align = "center") =>
    scene.addGrid("row", [cells], { gap: [cellGap, defaultGap.y], align });
  const column = (cells: Element[], cellGap: number, align: Align = "center") =>
    scene.addGrid(
      "column",
      cells.map((cell) => [cell]),
      { gap: [defaultGap.x, cellGap], align },
    );
  const split = (child: TreeChild): [Node, TreeChild[]] =>
    Array.isArray(child) ? child : [child, []];

  const join = (container: Grid, parent: Node, kids: TreeChild[], branch: Branch) => {
    container.id = `${parent.id}-tree`;
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
  const grow = (node: Node, kids: TreeChild[], growth: Growth): Grid => {
    const subtrees = () => kids.map((kid) => subtree(kid, growth));
    switch (growth) {
      case "down": {
        const levels = column([node, row(subtrees(), gap, "start")], levelGap);
        return join(levels, node, kids, () => [node, { viaY: levels.gutterY(0) }]);
      }
      case "right":
      case "left": {
        const subtreeColumn = side(kids, growth);
        const levels = row(
          growth === "left" ? [subtreeColumn, node] : [node, subtreeColumn],
          levelGap,
        );
        return join(levels, node, kids, () => [node, { viaX: levels.gutterX(0) }]);
      }
      case "indent": {
        const indented = scene.addGrid(
          "grid",
          subtrees().map((s) => [null, s]),
          { gap: [treeSpacing.indent, gap], align: "start" },
        );
        const levels = column([node, indented], gap, "start");
        const trunk = node.bottomLeft.offset(treeSpacing.trunk, 0);
        return join(levels, node, kids, () => [trunk, "vh"]);
      }
    }
  };

  if (children.length === 0)
    return join(column([root], defaultGap.y), root, [], () => [root, "straight"]);
  if (layout !== "both") return grow(root, children, layout);
  const lefts = children.filter((_, i) => i % 2 === 1);
  const cells = [
    ...(lefts.length ? [side(lefts, "left")] : []),
    root,
    side(
      children.filter((_, i) => i % 2 === 0),
      "right",
    ),
  ];
  const halves = row(cells, levelGap);
  const at = cells.indexOf(root);
  return join(halves, root, children, (i) => [root, { viaX: halves.gutterX(i % 2 ? 0 : at) }]);
}
