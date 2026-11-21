/** Trees: positions for each layout, edge routes, branch groups, and the checks they pass. */

import assert from "node:assert/strict";
import { test } from "node:test";
import { DiagramBuilder } from "../../../src/diagram/builder.ts";
import { compile } from "../../../src/diagram/compile/compile.ts";
import { expand } from "../../../src/diagram/drawing.ts";
import type { Node } from "../../../src/diagram/elements.ts";
import type { Measure } from "../../../src/diagram/metrics.ts";
import { Scene } from "../../../src/diagram/scene.ts";
import type { TreeLayout } from "../../../src/diagram/tree.ts";
import { fixedIcons } from "./fixed-icons.ts";

/** 7 units per character: deterministic stand-in for font measurement. */
const measure: Measure = (text) => text.length * 7;
const lookups = { measure, icons: fixedIcons };

/** An empty box of a fixed size, so that positions are easy to state. */
function sized(d: DiagramBuilder, id: string, width = 100, height = 40): Node {
  return d.box("", { id, width, height });
}

/** The rectangles of a compiled diagram's nodes, by id. */
function rects(out: ReturnType<typeof compile>) {
  return Object.fromEntries(out.nodes.map((n) => [n.id, n.rect]));
}

/** The route points of a compiled diagram's edges, by id. */
function routes(out: ReturnType<typeof compile>) {
  return Object.fromEntries(out.edges.map((e) => [e.id, e.points]));
}

/**
 * An uneven tree of three levels: r over a with a1 and a2 (a2 over x and y), and the leaf b,
 * all 100 × 40.
 */
function uneven(layout: TreeLayout, extra: (d: DiagramBuilder) => void = () => {}) {
  const scene = new Scene();
  const d = new DiagramBuilder(scene);
  const n = (id: string) => sized(d, id);
  const t = d.tree(n("r"), [[n("a"), [n("a1"), [n("a2"), [n("x"), n("y")]]]], n("b")], { layout });
  extra(d);
  return { out: compile(scene, lookups), tree: t };
}

test("down: the root is centered over all of its subtrees, which are top-aligned", () => {
  const { out, tree } = uneven("down");
  assert.deepEqual(out.diagnostics, []);
  assert.equal(tree.id, "r-tree");
  const r = rects(out);
  const at = (id: string) => [r[id]?.x, r[id]?.y];
  assert.deepEqual(at("x"), [124, 264]);
  assert.deepEqual(at("y"), [248, 264]);
  assert.deepEqual(at("a2"), [186, 176], "centered over x and y");
  assert.deepEqual(at("a1"), [0, 176]);
  assert.deepEqual(at("a"), [124, 88], "centered over a1 and the subtree of a2");
  assert.deepEqual(at("b"), [372, 88], "a leaf sits at the top of its level");
  assert.deepEqual(at("r"), [186, 0], "over the whole of its subtrees, not over a and b");
});

test("down: each line leaves the parent's bottom and turns halfway down the level gap", () => {
  const { out } = uneven("down");
  const r = rects(out);
  const p = routes(out);
  const cx = (id: string) => (r[id]?.x ?? 0) + 50;
  assert.deepEqual(p["r->a"], [
    { x: cx("r"), y: 40 },
    { x: cx("r"), y: 64 },
    { x: cx("a"), y: 64 },
    { x: cx("a"), y: 88 },
  ]);
  assert.deepEqual(p["r->b"], [
    { x: cx("r"), y: 40 },
    { x: cx("r"), y: 64 },
    { x: cx("b"), y: 64 },
    { x: cx("b"), y: 88 },
  ]);
  assert.equal(
    out.edges.every((e) => !e.head && !e.tail),
    true,
    "lines have no arrowheads",
  );
});

test("right: the tree turned, children left-aligned and the root centered on its subtrees", () => {
  const { out } = uneven("right");
  assert.deepEqual(out.diagnostics, []);
  const r = rects(out);
  const at = (id: string) => [r[id]?.x, r[id]?.y];
  assert.deepEqual(at("x"), [444, 64]);
  assert.deepEqual(at("y"), [444, 128]);
  assert.deepEqual(at("a2"), [296, 96], "centered on x and y");
  assert.deepEqual(at("a1"), [296, 0], "siblings are left-aligned");
  assert.deepEqual(at("a"), [148, 64]);
  assert.deepEqual(at("b"), [148, 192]);
  assert.deepEqual(at("r"), [0, 96], "centered on the whole of its subtrees");
  assert.deepEqual(routes(out)["r->b"], [
    { x: 100, y: 116 },
    { x: 124, y: 116 },
    { x: 124, y: 212 },
    { x: 148, y: 212 },
  ]);
});

test("both: children alternate right and left, and the left ones grow to the left", () => {
  const scene = new Scene();
  const d = new DiagramBuilder(scene);
  const n = (id: string) => sized(d, id);
  const tree = d.tree(n("r"), [n("a"), [n("b"), [n("b1"), [n("b2"), [n("z")]]]], n("c")], {
    layout: "both",
  });
  const out = compile(scene, lookups);
  assert.deepEqual(out.diagnostics, []);
  assert.equal(tree.id, "r-tree");
  const r = rects(out);
  assert.equal(r.z?.x, 0, "deeper levels grow away from the root");
  assert.equal(r.b2?.x, 148);
  assert.equal(r.b1?.x, r.b2?.x, "left siblings are right-aligned");
  assert.equal(r.b?.x, 296);
  assert.equal(r.r?.x, 444);
  assert.equal(r.a?.x, 592);
  assert.equal(r.c?.x, 592);
  assert.ok((r.a?.y ?? 0) < (r.c?.y ?? 0));
  const p = routes(out);
  const y = (id: string) => (r[id]?.y ?? 0) + 20;
  assert.deepEqual(p["r->b"], [
    { x: 444, y: y("r") },
    { x: 420, y: y("r") },
    { x: 396, y: y("b") },
  ]);
  assert.deepEqual(p["r->c"], [
    { x: 544, y: y("r") },
    { x: 568, y: y("r") },
    { x: 568, y: y("c") },
    { x: 592, y: y("c") },
  ]);
  assert.deepEqual(p["b->b1"]?.[0], { x: 296, y: y("b") }, "a left child's lines leave its left");
});

test("indent: each subtree is indented under its parent, with lines from under its left part", () => {
  const { out } = uneven("indent");
  assert.deepEqual(out.diagnostics, []);
  const r = rects(out);
  const at = (id: string) => [r[id]?.x, r[id]?.y];
  assert.deepEqual(at("r"), [0, 0]);
  assert.deepEqual(at("a"), [32, 64]);
  assert.deepEqual(at("a1"), [64, 128]);
  assert.deepEqual(at("a2"), [64, 192]);
  assert.deepEqual(at("x"), [96, 256]);
  assert.deepEqual(at("y"), [96, 320]);
  assert.deepEqual(at("b"), [32, 384]);
  const p = routes(out);
  assert.deepEqual(p["r->a"], [
    { x: 12, y: 40 },
    { x: 12, y: 84 },
    { x: 32, y: 84 },
  ]);
  assert.deepEqual(p["r->b"], [
    { x: 12, y: 40 },
    { x: 12, y: 404 },
    { x: 32, y: 404 },
  ]);
});

test("the lines from one parent share a trunk, which is not EDGE_OVERLAP, in every layout", () => {
  for (const layout of ["down", "right", "both", "indent"] as const) {
    const scene = new Scene();
    const d = new DiagramBuilder(scene);
    const n = (id: string) => sized(d, id, 80, 30);
    d.tree(
      n("r"),
      [
        [n("a"), [n("a1"), n("a2"), [n("a3"), [n("x"), n("y"), n("z")]]]],
        n("b"),
        [n("c"), [n("c1"), n("c2")]],
        n("d"),
        n("e"),
      ],
      { layout },
    );
    assert.deepEqual(compile(scene, lookups).diagnostics, [], layout);
  }
});

test("a subtree's container groups its lines, so a step on it focuses the whole branch", () => {
  const { out } = uneven("down");
  assert.deepEqual([...expand(["a-tree"], out.groups)].sort(), [
    "a",
    "a->a1",
    "a->a2",
    "a-children",
    "a-tree",
    "a1",
    "a2",
    "a2->x",
    "a2->y",
    "a2-children",
    "a2-tree",
    "x",
    "y",
  ]);
  assert.ok(expand(["r-tree"], out.groups).has("r->b"));
  assert.ok(!expand(["a-tree"], out.groups).has("r->a"), "the line into a branch is its parent's");
});

test("edge options apply to every line, and an explicit root id names the container", () => {
  const scene = new Scene();
  const d = new DiagramBuilder(scene);
  const tree = d.tree(d.box("Root", { id: "top" }), [d.box("A"), d.box("B")], {
    edge: { tail: "filled", dashed: true, role: "muted" },
  });
  const out = compile(scene, lookups);
  assert.deepEqual(out.diagnostics, []);
  assert.equal(tree.id, "top-tree");
  assert.deepEqual(
    out.edges.map((e) => [e.id, e.dashed, e.role, e.head, e.tail?.kind]),
    [
      ["top->a", true, "muted", undefined, "filled"],
      ["top->b", true, "muted", undefined, "filled"],
    ],
  );
  const top = out.nodes.find((n) => n.id === "top")?.rect;
  assert.equal(
    out.edges[0]?.tail?.points[0]?.y,
    top && top.y + top.height,
    "the head is at the root",
  );
});

test("a branch is named after its root's final id, and the tree's id names the outermost", () => {
  const scene = new Scene();
  const d = new DiagramBuilder(scene);
  const other = d.box("Team");
  const team = d.box("Team");
  const branch = d.tree(team, [d.box("A")]);
  const org = d.tree(d.box("Root"), [d.box("B"), [d.box("C"), [d.box("D")]]], { id: "org" });
  d.column([other, branch, org]);
  const out = compile(scene, lookups);
  assert.deepEqual(out.diagnostics, []);
  assert.deepEqual([team.id, branch.id, org.id], ["team-2", "team-2-tree", "org"]);
  assert.deepEqual(
    scene.grids.map((g) => g.id),
    ["team-2-children", "team-2-tree", "c-children", "c-tree", "root-children", "org", "column-1"],
  );
});

test("each layout names a node's subtrees after it, and both names the root's two sides", () => {
  const names = (layout: TreeLayout) => {
    const scene = new Scene();
    const d = new DiagramBuilder(scene);
    d.tree(d.box("R"), [[d.box("A"), [d.box("A1")]], d.box("B")], { layout });
    compile(scene, lookups);
    return scene.grids.map((g) => g.id);
  };
  for (const layout of ["down", "right", "indent"] as const)
    assert.deepEqual(names(layout), ["a-children", "a-tree", "r-children", "r-tree"], layout);
  assert.deepEqual(names("both"), ["r-left", "a-children", "a-tree", "r-right", "r-tree"]);
});

test("a tree nests in a row like any element, and its own gaps are kept", () => {
  const scene = new Scene();
  const d = new DiagramBuilder(scene);
  const left = sized(d, "left");
  const t = d.tree(sized(d, "r"), [sized(d, "a"), sized(d, "b")], { gap: 10, levelGap: 30 });
  d.row([left, t], { gap: 20 });
  const out = compile(scene, lookups);
  assert.deepEqual(out.diagnostics, []);
  const r = rects(out);
  assert.equal(r.a?.x, 120);
  assert.equal(r.b?.x, 230);
  assert.equal(r.r?.x, 175);
  assert.equal(r.a?.y, 70);
  assert.equal(r.left?.y, 35, "centered on the tree's height");
});

test("one child sits under its parent, and a tree without children is its root alone", () => {
  const scene = new Scene();
  const d = new DiagramBuilder(scene);
  d.tree(sized(d, "r"), [sized(d, "a")]);
  const out = compile(scene, lookups);
  assert.deepEqual(out.diagnostics, []);
  assert.deepEqual(routes(out)["r->a"], [
    { x: 50, y: 40 },
    { x: 50, y: 64 },
    { x: 50, y: 88 },
  ]);
  for (const layout of ["down", "right", "both", "indent"] as const) {
    const eScene = new Scene();
    const e = new DiagramBuilder(eScene);
    const t = e.tree(sized(e, "r"), [], { layout });
    const alone = compile(eScene, lookups);
    assert.deepEqual(alone.diagnostics, [], layout);
    assert.equal(t.id, "r-tree");
    assert.deepEqual(alone.groups["r-tree"], ["r"]);
    assert.equal(alone.edges.length, 0);
  }
});

test("a node placed elsewhere is CONFLICTING_PLACEMENT, as in any row or column", () => {
  const scene = new Scene();
  const d = new DiagramBuilder(scene);
  const a = sized(d, "a");
  const b = sized(d, "b");
  const t = d.tree(sized(d, "r"), [a]);
  d.column([d.row([a, b]), t]);
  const out = compile(scene, lookups);
  const conflict = out.diagnostics.find((x) => x.code === "CONFLICTING_PLACEMENT");
  assert.match(
    conflict?.message ?? "",
    /^a is positioned by both row\(r-children\) and row\(row-1\)/,
  );
});

test("a layout that is not one of the four is INVALID_ARGUMENT, and the tree grows down", () => {
  const drawn = (layout: TreeLayout) => {
    const scene = new Scene();
    const d = new DiagramBuilder(scene);
    const other = sized(d, "other");
    const t = d.tree(sized(d, "r"), [sized(d, "a"), sized(d, "b")], { layout });
    d.column([other, t]);
    return compile(scene, lookups);
  };
  const out = drawn("up" as TreeLayout);
  assert.deepEqual(out.diagnostics, [
    {
      code: "INVALID_ARGUMENT",
      message:
        'tree r-tree: layout is "up", but it takes "down", "right", "both", or "indent". The default is used.',
      ids: ["r-tree"],
      subject: "layout",
    },
  ]);
  const down = drawn("down");
  assert.deepEqual(rects(out), rects(down));
  assert.deepEqual(routes(out), routes(down));
});

test("a node in a row and then in a tree names the tree's container by its final id", () => {
  const scene = new Scene();
  const d = new DiagramBuilder(scene);
  const x = d.box("X");
  d.column([d.row([x, sized(d, "y")]), d.tree(d.box("R"), [x])]);
  const out = compile(scene, lookups);
  const conflict = out.diagnostics.find((c) => c.code === "CONFLICTING_PLACEMENT");
  assert.deepEqual(conflict, {
    code: "CONFLICTING_PLACEMENT",
    message:
      "x is positioned by both row(row-1) and row(r-children). Each element has one position owner.",
    ids: ["x"],
  });
});
