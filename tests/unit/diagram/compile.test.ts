/** The diagram compiler: layout, placement, edges, labels, sizing, enclosures, and diagnostics. */

import assert from "node:assert/strict";
import { test } from "node:test";
import { DiagramBuilder } from "../../../src/diagram/builder.ts";
import { compile } from "../../../src/diagram/compile/compile.ts";
import type { Node } from "../../../src/diagram/elements.ts";
import type { Measure } from "../../../src/diagram/metrics.ts";
import type { SequenceStep } from "../../../src/diagram/sequence.ts";

/** 7 units per character: deterministic stand-in for font measurement. */
const measure: Measure = (text) => text.length * 7;
const codes = (d: ReturnType<typeof compile>) => d.diagnostics.map((x) => x.code);

test("row places children with boundary gaps and centered cross-axis alignment", () => {
  const d = new DiagramBuilder();
  const a = d.box("A", { height: 48 });
  const b = d.box("B", { height: 96 });
  d.row([a, b], { gap: 30 });
  const out = compile(d, measure);
  assert.deepEqual(out.diagnostics, []);
  const [ra, rb] = out.nodes.map((n) => n.rect);
  assert.equal(ra?.x, 0);
  assert.equal(rb?.x, (ra?.width ?? 0) + 30);
  assert.equal(ra?.y, 24);
  assert.equal(rb?.y, 0);
});

/** An empty box of a fixed size, so that track sizes are easy to state. */
function sized(d: DiagramBuilder, id: string, width: number, height: number) {
  return d.box("", { id, width, height });
}

/** The rectangles of a compiled diagram's nodes, by id. */
function rects(out: ReturnType<typeof compile>) {
  return Object.fromEntries(out.nodes.map((n) => [n.id, n.rect]));
}

test("a grid sizes each column to its widest cell and each row to its tallest", () => {
  const d = new DiagramBuilder();
  const a = sized(d, "a", 100, 40);
  const b = sized(d, "b", 60, 80);
  const c = sized(d, "c", 140, 50);
  const e = sized(d, "e", 30, 30);
  const g = d.grid(
    [
      [a, b],
      [c, null, e],
    ],
    { gap: [20, 10] },
  );
  const x = sized(d, "x", 50, 50);
  d.place(x, { rightOf: g, gap: 0 });
  const out = compile(d, measure);
  assert.deepEqual(out.diagnostics, []);
  const r = rects(out);
  assert.deepEqual(r.a, { x: 20, y: 20, width: 100, height: 40 }, "centered in its tracks");
  assert.deepEqual(r.b, { x: 160, y: 0, width: 60, height: 80 });
  assert.deepEqual(r.c, { x: 0, y: 90, width: 140, height: 50 });
  assert.deepEqual(r.e, { x: 240, y: 100, width: 30, height: 30 }, "after an empty cell");
  assert.equal(r.x?.x, 270, "the grid is 140 + 60 + 30 and two gaps wide");
  assert.equal(r.x?.y, 45, "and 80 + 50 and one gap tall");
  assert.deepEqual(out.groups[g.id], ["a", "b", "c", "e"], "a step focuses its cells");
});

test("a grid aligns cells in their tracks, one value or one for each direction", () => {
  const layout = (align: "end" | ["start", "end"]) => {
    const d = new DiagramBuilder();
    const a = sized(d, "a", 100, 40);
    const b = sized(d, "b", 60, 80);
    const c = sized(d, "c", 140, 50);
    d.grid(
      [
        [a, b],
        [c, null],
      ],
      { gap: 10, align },
    );
    return rects(compile(d, measure));
  };
  assert.deepEqual(layout("end").a, { x: 40, y: 40, width: 100, height: 40 });
  assert.deepEqual(layout(["start", "end"]).a, { x: 0, y: 40, width: 100, height: 40 });
  assert.deepEqual(layout(["start", "end"]).c, { x: 0, y: 90, width: 140, height: 50 });
});

test("rows and columns are grids of one row and one column, with the default gaps", () => {
  const d = new DiagramBuilder();
  const a = sized(d, "a", 100, 40);
  const b = sized(d, "b", 60, 80);
  const c = sized(d, "c", 140, 50);
  const e = sized(d, "e", 30, 30);
  const f = sized(d, "f", 30, 30);
  const row = d.row([a, b], { align: "end" });
  const column = d.column([c, e], { align: "start" });
  const grid = d.grid([[f]]);
  d.place(d.column([row, column, grid]), { at: [0, 0], anchor: "topLeft" });
  const out = compile(d, measure);
  assert.deepEqual(out.diagnostics, []);
  assert.deepEqual([row.id, column.id, grid.id], ["row-1", "column-2", "grid-3"]);
  const r = rects(out);
  assert.deepEqual(r.a, { x: 0, y: 40, width: 100, height: 40 }, "a row aligns vertically");
  assert.equal(r.b?.x, 188, "88 between columns");
  assert.deepEqual(r.c, { x: 54, y: 144, width: 140, height: 50 }, "64 below the row");
  assert.deepEqual(r.e, { x: 54, y: 258, width: 30, height: 30 }, "a column aligns horizontally");
});

test("a grid nests in a row, and its gutters are the middle of its gaps", () => {
  const d = new DiagramBuilder();
  const a = sized(d, "a", 100, 40);
  const b = sized(d, "b", 60, 80);
  const c = sized(d, "c", 140, 50);
  const g = d.grid(
    [
      [a, b],
      [null, c],
    ],
    { gap: 40 },
  );
  const side = sized(d, "side", 40, 40);
  d.row([side, g], { gap: 30 });
  d.arrow(a, c, { id: "down", route: { viaX: g.gutterX(0) } });
  d.arrow(a, b.bottom, { id: "under", route: { viaY: g.gutterY(0) } });
  const out = compile(d, measure);
  assert.deepEqual(out.diagnostics, []);
  const r = rects(out);
  assert.deepEqual(r.a, { x: 70, y: 20, width: 100, height: 40 });
  assert.deepEqual(r.side, { x: 0, y: 65, width: 40, height: 40 });
  const down = out.edges.find((e) => e.id === "down")?.points ?? [];
  assert.equal(down[1]?.x, 70 + 100 + 20, "the gap after column 0");
  const under = out.edges.find((e) => e.id === "under")?.points ?? [];
  assert.equal(under[1]?.y, 80 + 20, "the gap after row 0");
});

test("a gutter after the last track, or before the first, is UNKNOWN_GUTTER", () => {
  const d = new DiagramBuilder();
  const a = sized(d, "a", 100, 40);
  const b = sized(d, "b", 60, 80);
  const g = d.grid([[a, b]]);
  const row = d.row([d.box("C")]);
  d.place(row, { below: g });
  for (const p of [g.gutterX(1), g.gutterX(-1), g.gutterX(0.5), g.gutterY(0), row.gutterX(0)])
    d.arrow(a, p, { route: "hv" });
  d.arrow(a, b, { route: { viaX: g.gutterX(0) } });
  const out = compile(d, measure);
  assert.equal(out.ok, false);
  const unknown = out.diagnostics.filter((x) => x.code === "UNKNOWN_GUTTER");
  assert.equal(unknown.length, 5);
  assert.equal(unknown[0]?.message, "grid-1 has 2 columns, so gutterX takes only 0; got 1.");
  assert.equal(unknown[3]?.message, "grid-1 has 1 row, so gutterY has no gap to name; got 0.");
  assert.deepEqual(unknown[4]?.ids, ["row-2"]);
});

test("the drawing keeps hundredths and leaves out false flags and centered alignment", () => {
  const d = new DiagramBuilder();
  const precise: Measure = (text) => text.length * 7.123456;
  const a = d.box("Alpha", { sub: "first" });
  const b = d.box("Beta");
  d.row([a, b], { gap: 41.987654 });
  d.arrow(a, b, "calls");
  const out = compile(d, precise);
  const numbers: number[] = [];
  JSON.stringify([out.nodes, out.edges], (_, v) => {
    if (typeof v === "number") numbers.push(v);
    return v;
  });
  assert.ok(numbers.length > 20);
  for (const n of numbers) assert.equal(Math.round(n * 100) / 100, n);
  const node = out.nodes[0];
  const edge = out.edges[0];
  assert.ok(node && edge);
  for (const key of ["passive", "stepOnly", "explicitId"]) {
    assert.ok(!(key in node), `node has no ${key}`);
    assert.ok(!(key in edge), `edge has no ${key}`);
  }
  assert.ok(!("dashed" in edge));
  assert.deepEqual(
    node.lines.map((l) => Object.keys(l)),
    [
      ["text", "x", "y", "size", "weight"],
      ["text", "x", "y", "size", "weight", "muted"],
    ],
  );
});

test("place below uses layout-boundary gap and resolves regardless of order", () => {
  const d = new DiagramBuilder();
  const db = d.cylinder("Database");
  const api = d.box("API");
  d.place(db, { below: api, gap: 50 });
  const out = compile(d, measure);
  const rdb = out.nodes.find((n) => n.id === "database")?.rect;
  const rapi = out.nodes.find((n) => n.id === "api")?.rect;
  assert.equal(rdb?.y, (rapi?.y ?? 0) + (rapi?.height ?? 0) + 50);
  assert.equal((rdb?.x ?? 0) + (rdb?.width ?? 0) / 2, (rapi?.x ?? 0) + (rapi?.width ?? 0) / 2);
});

test("placement cycle is reported with its chain", () => {
  const d = new DiagramBuilder();
  const a = d.box("A");
  const b = d.box("B");
  d.place(a, { rightOf: b });
  d.place(b, { rightOf: a });
  const out = compile(d, measure);
  assert.equal(out.ok, false);
  const cycle = out.diagnostics.find((x) => x.code === "PLACEMENT_CYCLE");
  assert.match(cycle?.message ?? "", /position\(a\) → position\(b\) → position\(a\)/);
});

test("conflicting ownership and duplicate explicit ids are errors; derived ids disambiguate", () => {
  const d = new DiagramBuilder();
  const a = d.box("Same");
  const twin = d.box("Same");
  d.box("X", { id: "dup" });
  d.box("Y", { id: "dup" });
  d.row([a]);
  d.place(a, { at: [0, 0] });
  const out = compile(d, measure);
  assert.ok(codes(out).includes("CONFLICTING_PLACEMENT"));
  assert.ok(codes(out).includes("DUPLICATE_ID"));
  assert.equal(twin.id, "same-2");
  assert.equal(out.ok, false);
});

test("elbow route keeps anchors and labels a vertical leg on its right", () => {
  const d = new DiagramBuilder();
  const cache = d.box("Cache");
  const db = d.box("Database");
  d.place(db, { below: cache, gap: 80, align: "end" });
  d.place(cache, { at: [300, 50] });
  const e = d.arrow(cache.bottom, db.left.offset(-40, 0), { route: "vh", label: "miss" });
  const out = compile(d, measure);
  const edge = out.edges.find((x) => x.id === e.id);
  assert.equal(edge?.points.length, 3);
  const [p0, p1] = edge?.points ?? [];
  assert.equal(p0?.x, p1?.x, "first leg is vertical");
  const label = edge?.labels[0];
  assert.ok(label && p0 && label.rect.x > p0.x, "label sits right of the vertical leg");
});

test("an edge with corners leaves at a right angle, at the projection of its next point", () => {
  const d = new DiagramBuilder();
  const a = d.box("A");
  const b = d.box("B");
  d.place(a, { at: [0, 0], anchor: "topLeft" });
  d.place(b, { at: [300, 0], anchor: "topLeft" });
  const near = d.arrow(a, b, {
    route: {
      via: [
        [82, -40],
        [382, -40],
      ],
    },
  });
  const beyond = d.arrow(a, b, {
    route: {
      via: [
        [101, -60],
        [352, -60],
      ],
    },
  });
  const out = compile(d, measure);
  const points = (id: string) => out.edges.find((e) => e.id === id)?.points;
  assert.deepEqual(points(near.id)?.[0], { x: 82, y: 0 });
  assert.deepEqual(points(near.id)?.at(-1), { x: 382, y: -5.5 }, "the head shortens the end");
  assert.deepEqual(points(beyond.id)?.[0], { x: 52, y: 0 }, "past the corner, the middle");
  assert.deepEqual(points(beyond.id)?.at(-1), { x: 352, y: -5.5 });
});

test("\\n in an edge label starts a new line; the rect covers every line", () => {
  const d = new DiagramBuilder();
  const a = d.box("A");
  const b = d.box("B");
  d.row([a, b], { gap: 200 });
  const e = d.arrow(a, b, "ab\ncdef");
  const out = compile(d, measure);
  assert.deepEqual(codes(out), []);
  const label = out.edges.find((x) => x.id === e.id)?.labels[0];
  assert.ok(label);
  assert.deepEqual(
    label.lines.map((l) => [l.text, l.size, l.weight, l.align]),
    [
      ["ab", 12, 500, undefined],
      ["cdef", 12, 500, undefined],
    ],
    "centered lines leave out align",
  );
  const [first, second] = label.lines;
  assert.ok(first && second);
  const lineHeight = 12 * 1.38;
  assert.equal(label.rect.width, 4 * 7 + 8, "as wide as the widest line, plus padding");
  assert.ok(Math.abs(label.rect.height - (2 * lineHeight + 2)) < 1e-9);
  assert.equal(first.x, label.rect.x + label.rect.width / 2, "lines are centered");
  assert.equal(second.x, first.x);
  assert.ok(Math.abs(second.y - first.y - lineHeight) < 1e-9);
  const middle = label.rect.y + label.rect.height / 2;
  assert.ok(Math.abs((first.y + second.y) / 2 - middle) < 1e-9, "the lines sit in the middle");
  assert.ok(out.viewBox.y <= label.rect.y, "the view box holds both lines");
  assert.ok(
    out.edges.find((x) => x.id === e.id)?.ariaLabel.startsWith("ab cdef, "),
    "the accessible name reads the label on one line",
  );
});

test("a multi-line label is checked with its full height and quoted on one line", () => {
  const overlaps = (text: string) => {
    const d = new DiagramBuilder();
    const x = d.box("X");
    const y = d.box("Y");
    const top = d.box("Top");
    d.place(x, { at: [0, 0] });
    d.place(y, { at: [400, 0] });
    d.place(top, { at: [200, -35], anchor: "bottom" });
    d.arrow(x, y, text);
    return compile(d, measure).diagnostics.filter((x) => x.code === "LABEL_OVERLAP");
  };
  assert.deepEqual(overlaps("short"), []);
  const hits = overlaps("one\ntwo\nthree");
  assert.equal(hits.length, 1);
  assert.match(hits[0]?.message ?? "", /label "one two three" intersects top/);
});

test("sequence message labels break lines like edge labels", () => {
  const d = new DiagramBuilder();
  const a = d.box("A");
  const b = d.box("B");
  d.sequence([a, b], [{ from: a, to: b, label: "first\nsecond", id: "msg" }]);
  const out = compile(d, measure);
  const label = out.edges.find((e) => e.id === "msg")?.labels[0];
  assert.deepEqual(
    label?.lines.map((l) => l.text),
    ["first", "second"],
  );
});

test("element endpoints snap to facing sides; obstacles are reported, not avoided", () => {
  const d = new DiagramBuilder();
  const a = d.box("Left");
  const mid = d.box("Middle");
  const b = d.box("Right");
  d.row([a, mid, b]);
  d.arrow(a, b);
  const out = compile(d, measure);
  const edge = out.edges[0];
  const ra = out.nodes[0]?.rect;
  assert.equal(edge?.points[0]?.x, (ra?.x ?? 0) + (ra?.width ?? 0));
  assert.ok(codes(out).includes("EDGE_NODE_INTERSECTION"));
  assert.equal(out.ok, true, "warnings do not fail compilation");
});

test("an edge that runs through its own end is reported; the legs that touch an end are not", () => {
  const d = new DiagramBuilder();
  const source = d.box("Source");
  const target = d.box("Target");
  const other = d.box("Other");
  d.row([source, other], { gap: 120 });
  d.place(target, { below: source });
  const through = d.arrow(source, target, { route: "vh" });
  const around = d.arrow(source, other, {
    route: { via: [source.top.offset(0, -30), other.top.offset(0, -30)] },
  });
  const diamond = d.decision("Ok?");
  d.place(diamond, { below: other });
  const straight = d.arrow(other, diamond);
  const out = compile(d, measure);
  const hits = out.diagnostics.filter((x) => x.code === "EDGE_NODE_INTERSECTION");
  assert.deepEqual(
    hits.map((x) => x.ids),
    [[through.id, "target"]],
  );
  assert.match(hits[0]?.message ?? "", /runs through its own end target/);
  assert.ok(![around.id, straight.id].some((id) => hits.some((x) => x.ids.includes(id))));
});

test("equalSize, fixed-width wrapping, and overflow", () => {
  const d = new DiagramBuilder();
  const a = d.box("Short");
  const b = d.box("A much longer label");
  const c = d.box("wrap these words please", { width: 120, id: "wrapped" });
  const tight = d.box("Too tall\nfor this", { height: 20, id: "tight" });
  d.equalSize([a, b]);
  d.column([a, b, c, tight]);
  const out = compile(d, measure);
  assert.equal(out.nodes[0]?.rect.width, out.nodes[1]?.rect.width);
  assert.ok((out.nodes[2]?.lines.length ?? 0) > 1);
  assert.ok(codes(out).includes("TEXT_OVERFLOW"));
});

test("an overflowing member of a size group is reported once", () => {
  const d = new DiagramBuilder();
  const a = d.box("Too tall\nfor this", { height: 20, id: "tight" });
  const b = d.box("B");
  const c = d.box("C");
  d.equalSize([a, b, c]);
  d.row([a, b, c]);
  assert.deepEqual(codes(compile(d, measure)), ["TEXT_OVERFLOW", "FIXED_SIZE_IN_GROUP"]);
});

test("a fixed size in a size group is kept, and a smaller one is reported", () => {
  const d = new DiagramBuilder();
  const fixed = d.box("wrap these words please", { width: 120, id: "fixed" });
  const wide = d.box("A much much longer label than that", { id: "wide" });
  d.equalSize([fixed, wide]);
  d.row([fixed, wide]);
  const out = compile(d, measure);
  const rect = (id: string) => out.nodes.find((n) => n.id === id)?.rect;
  assert.equal(rect("fixed")?.width, 120);
  assert.equal(rect("wide")?.width, 34 * 7 + 2 * 16);
  assert.equal(rect("fixed")?.height, rect("wide")?.height);
  const lines = out.nodes.find((n) => n.id === "fixed")?.lines ?? [];
  assert.ok(lines.length > 1 && lines.every((l) => l.text.length * 7 <= 120 - 2 * 16));
  assert.deepEqual(codes(out), ["FIXED_SIZE_IN_GROUP"]);
  assert.match(out.diagnostics[0]?.message ?? "", /fixed has a fixed width of 120.*270/);
});

test("a fixed size that is the largest sets its group's size; other axes are free", () => {
  const d = new DiagramBuilder();
  const big = d.box("Big", { width: 300 });
  const small = d.box("Small");
  d.equalSize([big, small]);
  const a = d.box("A", { width: 80 });
  const b = d.box("B", { width: 140, sub: "two\nlines" });
  d.equalHeight([a, b]);
  d.column([d.row([big, small]), d.row([a, b])]);
  const out = compile(d, measure);
  assert.deepEqual(codes(out), []);
  const rect = (id: string) => out.nodes.find((n) => n.id === id)?.rect;
  assert.equal(rect("small")?.width, 300);
  assert.equal(rect("a")?.width, 80);
  assert.equal(rect("a")?.height, rect("b")?.height);
});

test("enclosure wraps members with title band and flags intruders", () => {
  const d = new DiagramBuilder();
  const api = d.box("API");
  const cache = d.box("Cache");
  const outsider = d.box("Outsider");
  d.row([api, cache]);
  const svc = d.enclose([api, cache], { title: "Service", padding: 10 });
  d.place(outsider, { below: api, gap: 0 });
  const out = compile(d, measure);
  const r = out.enclosures[0]?.rect;
  assert.ok(r && r.x === -10);
  assert.ok(codes(out).includes("ENCLOSURE_INTRUSION"));
  assert.equal(svc.id, "service");
});

test("sequence: calls open bars, replies close them, async and unanswered calls stay short", () => {
  const d = new DiagramBuilder();
  const a = d.box("A");
  const b = d.box("B");
  const c = d.cylinder("C");
  d.sequence(
    [a, b, c],
    [
      { from: a, to: b, label: "call", id: "call" },
      { from: b, to: c, label: "store", id: "store" },
      { from: b, to: a, label: "done", reply: true, id: "done" },
      { from: a, to: c, label: "notify", async: true, id: "notify" },
      {
        fragment: "loop",
        title: "retry",
        steps: [{ from: a, to: b, label: "again", id: "again" }],
      },
    ],
  );
  const out = compile(d, measure);
  assert.deepEqual(codes(out), []);
  const bars = out.nodes.filter((n) => n.shape === "bar");
  const barOf = (id: string) => bars.filter((n) => n.id.startsWith(`${id}-active`));
  const call = out.edges.find((e) => e.id === "call");
  const done = out.edges.find((e) => e.id === "done");
  const [bBar] = barOf("b");
  assert.ok(bBar && call && done);
  assert.ok(Math.abs(bBar.rect.y - (call.points[0]?.y ?? 0)) < 1);
  assert.ok(Math.abs(bBar.rect.y + bBar.rect.height - (done.points[0]?.y ?? 0)) < 1);
  assert.equal(barOf("c").length, 1);
  assert.ok((barOf("c")[0]?.rect.height ?? 99) < 44);
  assert.equal(done.dashed, true);
  assert.equal(done.head, "open");
  const frame = out.frames[0];
  assert.equal(frame?.tab?.line.text, "loop");
  assert.equal(frame?.title?.text, "[retry]");
  assert.ok(frame?.tab && frame.title);
  assert.ok(frame.tab.rect.width >= measure("loop", { family: "", size: 11, weight: 600 }) + 8);
  assert.ok(frame.title.x >= frame.tab.rect.x + frame.tab.rect.width);
});

/** Compile a sequence of boxes A, B, C and give the rectangles of its bars and notes by id. */
function sequenceRects(steps: (a: Node, b: Node, c: Node) => SequenceStep[]) {
  const d = new DiagramBuilder();
  const a = d.box("A");
  const b = d.box("B");
  const c = d.box("C");
  d.sequence([a, b, c], steps(a, b, c));
  const out = compile(d, measure);
  assert.deepEqual(codes(out), []);
  const rects = Object.fromEntries(
    out.nodes.filter((n) => n.shape === "bar" || n.shape === "note").map((n) => [n.id, n.rect]),
  );
  return { out, rects };
}

test("sequence: a reply closes the bar its call opened", () => {
  const { rects } = sequenceRects((a, b) => [
    { from: a, to: b, label: "call" },
    { from: b, to: a, label: "done", reply: true },
  ]);
  assert.deepEqual(rects, {
    "b-active-1": { x: 179, y: 79, width: 10, height: 44 },
  });
});

test("sequence: nested calls stack their bars and replies close them inside out", () => {
  const { rects } = sequenceRects((a, b, c) => [
    { from: a, to: b, label: "outer" },
    { from: b, to: c, label: "inner" },
    { from: c, to: b, label: "inner done", reply: true },
    { from: b, to: a, label: "outer done", reply: true },
  ]);
  assert.deepEqual(rects, {
    "b-active-1": { x: 179, y: 79, width: 10, height: 132 },
    "c-active-2": { x: 315, y: 123, width: 10, height: 44 },
  });
});

test("sequence: a self-message opens a nested bar beside the caller's bar", () => {
  const { out, rects } = sequenceRects((a, b) => [
    { from: a, to: b, label: "call" },
    { from: b, to: b, label: "think", id: "think" },
    { from: b, to: a, label: "done", reply: true },
  ]);
  assert.deepEqual(rects, {
    "b-active-1": { x: 179, y: 79, width: 10, height: 99 },
    "b-active-2": { x: 185, y: 142.8, width: 10, height: 22 },
  });
  assert.deepEqual(out.edges.find((e) => e.id === "think")?.points, [
    { x: 189, y: 123 },
    { x: 215, y: 123 },
    { x: 215, y: 147.2 },
    { x: 200.5, y: 147.2 },
  ]);
});

test("sequence: an async message opens no bar on its receiver", () => {
  const { out, rects } = sequenceRects((a, b) => [
    { from: a, to: b, label: "fire", async: true, id: "fire" },
  ]);
  assert.deepEqual(rects, {});
  assert.deepEqual(out.edges.find((e) => e.id === "fire")?.points, [
    { x: 48, y: 79 },
    { x: 183.2, y: 79 },
  ]);
});

test("sequence: a note sits over one participant or between two", () => {
  const { rects } = sequenceRects((a, b) => [
    { note: "one", over: a, id: "one" },
    { note: "both", over: [a, b], id: "both" },
  ]);
  assert.deepEqual(rects, {
    one: { x: 23, y: 85.6, width: 50, height: 34.56 },
    both: { x: 87.5, y: 136.2, width: 57, height: 34.56 },
  });
});

test("sequence: a fragment with an else branch frames both branches with a divider", () => {
  const { out, rects } = sequenceRects((a, b) => [
    {
      fragment: "alt",
      title: "ok",
      id: "alt",
      steps: [{ from: a, to: b, label: "yes" }],
      else: [{ title: "fail", steps: [{ from: a, to: b, label: "no" }] }],
    },
  ]);
  assert.deepEqual(rects, {
    "b-active-1": { x: 179, y: 103.2, width: 10, height: 24.2 },
    "b-active-2": { x: 179, y: 162.6, width: 10, height: 24.2 },
  });
  const frame = out.frames.find((f) => f.id === "alt");
  assert.deepEqual(frame?.rect, { x: -38, y: 59.2, width: 308, height: 134.2 });
  assert.deepEqual(
    frame?.dividers.map((div) => [div.y, div.label?.text]),
    [[131.8, "[fail]"]],
  );
});

test("sequence: a reply closes the last call from its receiver, and an earlier call stays short", () => {
  const { rects } = sequenceRects((a, b) => [
    { from: a, to: b, label: "fire" },
    { from: a, to: b, label: "call" },
    { from: b, to: a, label: "done", reply: true },
  ]);
  assert.deepEqual(rects, {
    "b-active-1": { x: 179, y: 79, width: 10, height: 24.2 },
    "b-active-2": { x: 179, y: 123, width: 10, height: 44 },
  });
});

test("sequence: an inner unanswered call does not take the reply to the outer call", () => {
  const { rects } = sequenceRects((a, b, c) => [
    { from: a, to: b, label: "outer" },
    { from: c, to: b, label: "inner" },
    { from: b, to: a, label: "done", reply: true },
  ]);
  assert.deepEqual(rects, {
    "b-active-1": { x: 179, y: 79, width: 10, height: 88 },
    "b-active-2": { x: 185, y: 123, width: 10, height: 24.2 },
  });
});

test("sequence: only receivers get bars; a sender without one sends from its lifeline", () => {
  const { out, rects } = sequenceRects((a, b, c) => [
    { from: a, to: b, label: "call", id: "call" },
    { from: b, to: c, label: "ask", id: "ask" },
    { from: c, to: b, label: "answer", reply: true, id: "answer" },
    { from: b, to: a, label: "done", reply: true, id: "done" },
    { from: c, to: c, label: "tidy", id: "tidy" },
  ]);
  assert.deepEqual(rects, {
    "b-active-1": { x: 179, y: 79, width: 10, height: 132 },
    "c-active-2": { x: 315, y: 123, width: 10, height: 44 },
    "c-active-3": { x: 315, y: 274.8, width: 10, height: 22 },
  });
  const points = (id: string) => out.edges.find((e) => e.id === id)?.points;
  assert.deepEqual(points("call")?.[0], { x: 48, y: 79 }, "the client's call leaves its lifeline");
  assert.deepEqual(points("done")?.at(-1), { x: 48.8, y: 211 }, "the reply ends at its lifeline");
  assert.deepEqual(
    points("ask")?.[0],
    { x: 189, y: 123 },
    "a caller that handles a call keeps its bar",
  );
  assert.deepEqual(points("tidy"), [
    { x: 320, y: 255 },
    { x: 351, y: 255 },
    { x: 351, y: 279.2 },
    { x: 330.5, y: 279.2 },
  ]);
});

test("sequence: a bar ends at its reply or after a short length, never at the last message", () => {
  const d = new DiagramBuilder();
  const envoy = d.box("Envoy");
  const contour = d.box("Contour");
  d.sequence(
    [envoy, contour],
    [
      { from: contour, to: envoy, label: "Cluster B (CDS)", id: "cds" },
      { from: envoy, to: contour, label: "request ClusterLoadAssignment B", id: "eds-req" },
      { note: "B warms: waits for endpoints", over: envoy, id: "warm" },
      { from: contour, to: envoy, label: "ClusterLoadAssignment B (EDS)", id: "eds" },
    ],
    { gap: 280, numbered: true, step: 64 },
  );
  const out = compile(d, measure);
  assert.deepEqual(codes(out), []);
  const bars = Object.fromEntries(
    out.nodes.filter((n) => n.shape === "bar").map((n) => [n.id, n.rect]),
  );
  assert.deepEqual(bars, {
    "envoy-active-1": { x: 43, y: 94, width: 10, height: 35.2 },
    "contour-active-2": { x: 419, y: 158, width: 10, height: 35.2 },
    "envoy-active-3": { x: 43, y: 295.6, width: 10, height: 35.2 },
  });
});

test("sequence: a note is painted over the activation bar under it", () => {
  const d = new DiagramBuilder();
  const envoy = d.box("Envoy");
  const contour = d.box("Contour");
  d.sequence(
    [envoy, contour],
    [
      { from: contour, to: envoy, label: "Cluster B (CDS)", id: "cds" },
      { from: envoy, to: contour, label: "request ClusterLoadAssignment B", id: "eds-req" },
      { note: "B warms: waits for endpoints", over: envoy, id: "warm" },
      { from: contour, to: envoy, label: "ClusterLoadAssignment B (EDS)", id: "eds" },
    ],
    { gap: 280, numbered: true, step: 64 },
  );
  const ids = compile(d, measure).nodes.map((n) => n.id);
  const bars = ids.filter((id) => id.includes("-active-"));
  assert.ok(bars.length > 0);
  for (const bar of bars) assert.ok(ids.indexOf(bar) < ids.indexOf("warm"), bar);
});

test("record cells are elements; an edge from a row leaves the record's side", () => {
  const d = new DiagramBuilder();
  const rec = d.record(["seq", "author", "text"], { title: "Message", id: "message" });
  const choice = d.decision("Same page?", { id: "choice" });
  d.row([rec, choice], { gap: 80 });
  const link = d.arrow(rec.element("text"), choice, { id: "link" });
  const out = compile(d, measure);
  const r = out.nodes.find((n) => n.id === "message")?.rect;
  const cell = out.nodes.find((n) => n.id === "message.text");
  const edge = out.edges.find((e) => e.id === link.id);
  assert.ok(r && cell && edge);
  assert.equal(cell.parent, "message");
  const start = edge.points[0];
  assert.equal(start?.x, r.x + r.width);
  assert.ok(start && start.y > r.y + r.height / 2, "the last row is in the lower half");
  assert.deepEqual(out.groups.message, ["message.seq", "message.author", "message.text"]);
  assert.equal(
    out.diagnostics.filter((x) => x.code === "EDGE_NODE_INTERSECTION").length,
    0,
    "an edge leaving through its own record crosses nothing",
  );
});

test("record cells are rectangles: the rest of a row, or whole rows", () => {
  const d = new DiagramBuilder();
  d.record(
    [
      ["Version", 4],
      ["Flow", 28],
      ["Source address", 128],
      ["A", 24],
      ["B", 16],
    ],
    {
      columns: 32,
      id: "ip",
    },
  );
  const out = compile(d, measure);
  const cell = (id: string) => out.nodes.find((n) => n.id === `ip.${id}`)?.rect;
  const flow = cell("flow");
  const source = cell("source-address");
  assert.ok(flow && source);
  assert.equal(source.y, flow.y + flow.height, "the address starts the next row");
  assert.equal(source.height, 4 * flow.height, "128 of 32 columns is four rows tall");
  assert.equal(source.width, (cell("version")?.width ?? 0) * 8, "and the full width");
  const spans = out.diagnostics.filter((x) => x.code === "CELL_SPAN").map((x) => x.ids[0]);
  assert.deepEqual(spans, ["ip.b"], "B needs 16 columns, but 8 remain");
});

test("a record widened by equalWidth widens its cells to its right side", () => {
  const d = new DiagramBuilder();
  const wide = d.record(["a\t4294967296"], { title: "HTTPProxy weights", id: "wide" });
  const narrow = d.record(["a\t0", "b\t1"], { title: "Envoy", id: "narrow" });
  d.equalWidth([wide, narrow]);
  d.row([wide, narrow], { gap: 40 });
  const out = compile(d, measure);
  const r = out.nodes.find((n) => n.id === "narrow")?.rect;
  const a = out.nodes.find((n) => n.id === "narrow.a")?.rect;
  const w = out.nodes.find((n) => n.id === "wide")?.rect;
  assert.ok(r && a && w);
  assert.equal(r.width, w.width);
  assert.equal(a.x + a.width, r.x + r.width, "the cell reaches the record's right side");
});

test("member ids follow their record's id, even when it is derived and repeated", () => {
  const d = new DiagramBuilder();
  const a = d.record(["key", "next"], { title: "entry" });
  const b = d.record(["key", "next"], { title: "entry" });
  d.row([a, b]);
  const link = d.arrow(a.element("next"), b.element("key"));
  const untitled = d.record(["x"]);
  d.place(untitled, { below: a });
  const out = compile(d, measure);
  assert.deepEqual(codes(out), []);
  assert.deepEqual(
    out.nodes.map((n) => n.id),
    [
      "entry",
      "entry.key",
      "entry.next",
      "entry-2",
      "entry-2.key",
      "entry-2.next",
      "record-3",
      "record-3.x",
    ],
  );
  assert.equal(link.id, "entry.next->entry-2.key");
});

test("a missing member is reported, and its parent stands in", () => {
  const d = new DiagramBuilder();
  const rec = d.record(["id"], { id: "users" });
  assert.equal(rec.element("email"), rec);
  const out = compile(d, measure);
  const missing = out.diagnostics.find((x) => x.code === "UNKNOWN_ELEMENT");
  assert.match(missing?.message ?? "", /no member "email"\. Members: id\./);
});

test("a header row lines up with the cells' tab columns", () => {
  const d = new DiagramBuilder();
  d.record(["id\tuuid", "email\ttext"], { id: "users", title: "users", header: "column\ttype" });
  const out = compile(d, measure);
  const rec = out.nodes.find((n) => n.id === "users");
  const cell = out.nodes.find((n) => n.id === "users.id");
  const header = rec?.lines.filter((l) => l.muted);
  assert.ok(rec && cell && header);
  assert.deepEqual(
    header.map((l) => l.text),
    ["column", "type"],
  );
  assert.equal(header[1]?.x, cell.lines[1]?.x, "type sits over uuid");
  assert.ok(cell.rect.y > (rec.divider ?? 0) + 20, "the header is between title and cells");
});

test("text marks are elements over their substring; unmatched marks are reported", () => {
  const d = new DiagramBuilder();
  const t = d.text("GET /users/42 HTTP/1.1\nHost: example.com\nAccept: */*", {
    id: "req",
    mono: true,
    marks: {
      path: "/users/42",
      header: { lines: "2" },
      nope: "absent",
      twice: "e",
      far: { lines: "4" },
    },
  });
  const centered = d.text("one two\nthree", { id: "c", marks: { two: "two" } });
  d.place(centered, { below: t });
  const out = compile(d, measure);
  const node = (id: string) => out.nodes.find((n) => n.id === id);
  const width = (s: string) => measure(s, { family: "", size: 0, weight: 0 });
  const path = node("req.path");
  const text = node("req")?.rect;
  assert.ok(path && text && t.element("path") !== t);
  assert.equal(path.rect.x, text.x + width("GET "));
  assert.equal(path.lines[0]?.text, "/users/42");
  const unmatched = out.diagnostics.filter((x) => x.code === "MARK_UNMATCHED");
  assert.deepEqual(
    unmatched.map((x) => x.ids[0]),
    ["req.nope", "req.twice", "req.far"],
  );
  assert.match(unmatched[1]?.message ?? "", /occurs \d+ times/);
  const two = node("c.two");
  const c = node("c")?.rect;
  assert.ok(two && c);
  assert.equal(two.rect.x, c.x + (c.width - width("one two")) / 2 + width("one "));
});

test("a marked substring split by wrapping says so", () => {
  const d = new DiagramBuilder();
  d.text("alpha beta gamma", { id: "t", width: 50, marks: { bg: "beta gamma" } });
  const out = compile(d, measure);
  const message = out.diagnostics.find((x) => x.code === "MARK_UNMATCHED")?.message ?? "";
  assert.match(message, /split across wrapped lines/);
});

test("a pin numbers a member", () => {
  const d = new DiagramBuilder();
  d.record(
    [
      ["Flags", { span: 8, pin: 1 }],
      ["Window", 24],
    ],
    { columns: 32, id: "tcp" },
  );
  const out = compile(d, measure);
  assert.equal(out.nodes.find((n) => n.id === "tcp.flags")?.pin, 1);
  assert.equal(out.nodes.find((n) => n.id === "tcp.window")?.pin, undefined);
});

test("arrow takes its label as a string; a sequence is one placeable element", () => {
  const d = new DiagramBuilder();
  const a = d.box("A");
  const b = d.box("B");
  const seq = d.sequence([a, b], [{ from: a, to: b, label: "hello" }]);
  const after = d.box("After");
  d.place(after, { below: seq, gap: 20 });
  const plain = d.arrow(after, a, "back");
  const out = compile(d, measure);
  assert.equal(plain.labels[0]?.text, "back");
  const lifeline = out.edges.find((e) => e.id === "a-lifeline");
  const rAfter = out.nodes.find((n) => n.id === "after")?.rect;
  assert.ok(lifeline && rAfter);
  const lifelineEnd = Math.max(...lifeline.points.map((p) => p.y));
  assert.ok(rAfter.y >= lifelineEnd + 19, "the element placed below clears the lifelines");
  assert.ok(
    out.edges.some((e) => e.id === "hello"),
    "message ids come from their labels",
  );
});

test("bend curves an edge to the left of travel with the label outside", () => {
  const d = new DiagramBuilder();
  const a = d.box("A");
  const b = d.box("B");
  d.row([a, b], { gap: 120 });
  const there = d.arrow(a, b, { label: "go", bend: 20 });
  const back = d.arrow(b, a, { label: "return", bend: 20 });
  const out = compile(d, measure);
  assert.deepEqual(codes(out), []);
  const go = out.edges.find((e) => e.id === there.id);
  const ret = out.edges.find((e) => e.id === back.id);
  assert.ok(go && ret);
  const top = (e: typeof go) => Math.min(...e.points.map((p) => p.y));
  const bottom = (e: typeof go) => Math.max(...e.points.map((p) => p.y));
  const centerY = (out.nodes[0]?.rect.y ?? 0) + (out.nodes[0]?.rect.height ?? 0) / 2;
  assert.ok(top(go) < centerY - 15, "left to right bows up");
  assert.ok(bottom(ret) > centerY + 15, "right to left bows down");
  assert.ok((go.labels[0]?.rect.y ?? 0) + (go.labels[0]?.rect.height ?? 0) <= top(go) + 1);
});

test("a self-loop leaves and returns on one side; bend with a route is an error", () => {
  const d = new DiagramBuilder();
  const s = d.box("Running");
  const t = d.box("Stopped");
  d.row([s, t]);
  const tick = d.arrow(s, s, { label: "tick", loop: "top" });
  d.arrow(s, t, { bend: 10, route: "hv" });
  const out = compile(d, measure);
  const r = out.nodes[0]?.rect;
  const loop = out.edges.find((e) => e.id === tick.id);
  assert.ok(r && loop);
  assert.ok(
    loop.points.every((p) => p.y <= r.y + 0.01),
    "the loop stays above the node",
  );
  assert.ok(codes(out).includes("BEND_WITH_ROUTE"));
});

test("an enclosure title can sit in any corner", () => {
  const d = new DiagramBuilder();
  const a = d.box("A");
  d.enclose([a], { title: "Group", titleAt: "bottomRight" });
  const out = compile(d, measure);
  const e = out.enclosures[0];
  assert.ok(e?.titleRect);
  assert.ok(e.titleRect.x > e.rect.x + e.rect.width / 2, "right half");
  assert.ok(e.titleRect.y > e.rect.y + e.rect.height / 2, "bottom edge");
});

test("containers list their members for steps: enclosures, grids, sequences, fragments", () => {
  const d = new DiagramBuilder();
  const a = d.box("A");
  const b = d.box("B");
  const seq = d.sequence(
    [a, b],
    [
      { from: a, to: b, label: "ask" },
      { fragment: "loop", id: "retry", steps: [{ from: a, to: b, label: "ask" }] },
      { note: "Done", over: b },
    ],
  );
  const c = d.box("C");
  d.place(c, { below: seq });
  d.enclose([c], { id: "outside" });
  const out = compile(d, measure);
  assert.deepEqual(out.groups.retry, ["ask-2"], "a fragment holds its messages");
  assert.ok(out.groups[seq.id]?.includes("ask") && out.groups[seq.id]?.includes("done"));
  assert.ok(out.groups[seq.id]?.includes("retry"), "a sequence holds its fragments");
  assert.deepEqual(out.groups.outside, ["c"]);
});

test("step-only elements may share a place without overlap warnings", () => {
  const d = new DiagramBuilder();
  const box = d.box("Counter");
  const one = d.note("count = 1", { stepOnly: true });
  const two = d.note("count = 2", { stepOnly: true });
  d.place(one, { below: box });
  d.place(two, { below: box });
  const out = compile(d, measure);
  assert.deepEqual(codes(out), []);
  assert.equal(out.nodes.filter((n) => n.stepOnly).length, 2);
});

test("one accent per figure: a second one is reported", () => {
  const d = new DiagramBuilder();
  const a = d.box("A", { role: "accent" });
  const b = d.box("B", { role: "accent" });
  d.place(b, { rightOf: a });
  d.arrow(a, b);
  const out = compile(d, measure);
  assert.deepEqual(codes(out), ["ACCENT_OVERUSED"]);
  assert.deepEqual(out.diagnostics[0]?.ids, ["a", "b"]);
});

test("categories: colors in order of first use, a legend, and a group for steps", () => {
  const d = new DiagramBuilder();
  const a = d.box("Orders", { category: "New" });
  const b = d.box("Batch job", { category: "To be removed" });
  const c = d.cylinder("Database");
  d.place(b, { rightOf: a });
  d.place(c, { rightOf: b });
  d.arrow(a, c, { category: "New", route: { viaY: a.bottom.offset(0, 40) } });
  const out = compile(d, measure);
  assert.deepEqual(codes(out), []);
  const node = (id: string) => out.nodes.find((n) => n.id === id);
  assert.equal(node("orders")?.category, 1);
  assert.equal(node("batch-job")?.category, 2);
  assert.equal(node("database")?.category, undefined);
  assert.equal(node("database")?.role, "default");
  assert.deepEqual(
    out.legend.map((e) => [e.name, e.id, e.slot, e.elements]),
    [
      ["New", "new", 1, ["orders", "orders->database"]],
      ["To be removed", "to-be-removed", 2, ["batch-job"]],
    ],
  );
  assert.deepEqual(out.groups["to-be-removed"], ["batch-job"]);
});

test("categories: a fifth is reported and drawn without a color", () => {
  const d = new DiagramBuilder();
  const boxes = ["A", "B", "C", "D", "E"].map((name) => d.box(name, { category: `Kind ${name}` }));
  d.row(boxes);
  const out = compile(d, measure);
  assert.deepEqual(codes(out), ["TOO_MANY_CATEGORIES"]);
  assert.equal(out.legend.length, 4);
  assert.equal(out.nodes.find((n) => n.id === "e")?.category, undefined);
});

test("categories: an id an element already has cannot name a category for steps", () => {
  const d = new DiagramBuilder();
  d.box("Cache", { category: "Cache" });
  const out = compile(d, measure);
  assert.deepEqual(codes(out), ["DUPLICATE_ID"]);
  assert.equal(out.groups.cache, undefined);
});

test("start and end labels sit beside the dot without moving it, and are checked", () => {
  const d = new DiagramBuilder();
  const start = d.start("Clicked");
  const step = d.box("Step");
  const end = d.end();
  d.column([start, step, end]);
  d.arrow(start, step);
  d.arrow(step, end);
  const out = compile(d, measure);
  assert.deepEqual(codes(out), []);
  const node = (id: string) => out.nodes.find((n) => n.id === id);
  const dot = node("clicked");
  const box = node("step")?.rect;
  assert.ok(dot?.labelRect && box);
  assert.equal(dot.rect.x + dot.rect.width / 2, box.x + box.width / 2);
  assert.equal(dot.labelRect.x, dot.rect.x + dot.rect.width + 8);
  assert.equal(dot.lines[0]?.text, "Clicked");
  assert.ok(out.viewBox.x + out.viewBox.width >= dot.labelRect.x + dot.labelRect.width);
  assert.ok(node("end-3"), "an unlabeled end keeps its numbered id");

  const e = new DiagramBuilder();
  const s = e.start("Go", { side: "below" });
  const b = e.box("Next");
  e.column([s, b]);
  e.arrow(s, b);
  assert.ok(codes(compile(e, measure)).includes("EDGE_NODE_INTERSECTION"));
});

test("a ruler labels each side from a function, and crowded labels are reported", () => {
  const d = new DiagramBuilder();
  const packet = d.record([["Field", 32]], {
    id: "packet",
    columns: 32,
    width: 640,
    ruler: { top: (i) => (i % 8 ? "" : i), left: (row) => `0x${row * 4}` },
  });
  const crowded = d.record([["Word", 32]], {
    id: "crowded",
    columns: 32,
    width: 320,
    ruler: { top: (i) => 31 - i },
  });
  d.column([packet, crowded]);
  const out = compile(d, measure);
  const labels = out.nodes.find((n) => n.id === "packet")?.lines.map((l) => l.text);
  assert.deepEqual(labels, ["0", "8", "16", "24", "0x0"]);
  const crowdedIds = out.diagnostics.filter((x) => x.code === "RULER_CROWDED").map((x) => x.ids[0]);
  assert.deepEqual(crowdedIds, ["crowded"]);
});

test("a cell is as wide as the columns it spans", () => {
  const d = new DiagramBuilder();
  d.record(
    [
      ["Flags", 8],
      ["Window", 24],
    ],
    { columns: 32, id: "tcp" },
  );
  const out = compile(d, measure);
  const width = (id: string) => out.nodes.find((n) => n.id === id)?.rect.width ?? 0;
  assert.ok(width("tcp.flags") > 0);
  assert.equal(width("tcp.window"), 3 * width("tcp.flags"), "Window is three times Flags");
  assert.deepEqual(out.diagnostics, []);
});

test("an edge leaves a wide cell through the side its line crosses first", () => {
  const d = new DiagramBuilder();
  const rec = d.record([["Options", 32]], { columns: 32, width: 420, id: "tcp" });
  const note = d.note("Up to 40 bytes", { id: "note" });
  d.place(note, { below: rec, gap: 40, align: "end" });
  d.arrow(note, rec.element("options"));
  const out = compile(d, measure);
  const cell = out.nodes.find((n) => n.id === "tcp.options")?.rect;
  const tip = out.edges[0]?.heads[0]?.[0];
  assert.ok(cell && tip);
  assert.deepEqual(tip, { x: cell.x + cell.width / 2, y: cell.y + cell.height });
});

test("a run of spaces is measured as one space, as SVG text draws it", () => {
  const size = (label: string) => {
    const d = new DiagramBuilder();
    d.box(label, { id: "a" });
    return compile(d, measure).nodes.find((n) => n.id === "a")?.rect.width;
  };
  assert.equal(size("Read  model   cache"), size("Read model cache"));
});

test("an edge through free text is reported; an edge that ends at a text is not", () => {
  const d = new DiagramBuilder();
  const a = d.box("A");
  const heading = d.text("Heading");
  const b = d.box("B");
  d.row([a, heading, b]);
  const through = d.arrow(a, b);
  const note = d.text("Note");
  d.place(note, { below: a });
  const toText = d.arrow(a, note);
  const out = compile(d, measure);
  const hits = out.diagnostics.filter((x) => x.code === "EDGE_NODE_INTERSECTION");
  assert.deepEqual(
    hits.map((x) => x.ids),
    [[through.id, heading.id]],
  );
  assert.ok(!hits.some((x) => x.ids.includes(toText.id)));
});

/** The length of a compiled head: from its tip to the middle of its base. */
function headLength(head: Array<{ x: number; y: number }>): number {
  const [tip, left, , right] = head;
  assert.ok(tip && left && right);
  return Math.hypot(tip.x - (left.x + right.x) / 2, tip.y - (left.y + right.y) / 2);
}

test("a head with too little room shrinks and is reported; a curve carries a full head", () => {
  const d = new DiagramBuilder();
  const a = d.box("A");
  const b = d.box("B");
  d.row([a, b], { gap: 4 });
  const close = d.arrow(a, b);
  const c = d.box("C");
  const e = d.box("E");
  d.place(d.row([c, e]), { below: a });
  const curved = d.arrow(c, e, { bend: 20 });
  const out = compile(d, measure);
  const crowded = out.diagnostics.filter((x) => x.code === "HEAD_CROWDED");
  assert.deepEqual(
    crowded.map((x) => [x.ids, x.message]),
    [[[close.id], "a->b has 4 units for its arrowhead, which needs 17. Widen the gap."]],
  );
  const head = (id: string) => out.edges.find((x) => x.id === id)?.heads[0] ?? [];
  assert.ok(Math.abs(headLength(head(close.id)) - 2.4) < 0.01);
  assert.ok(Math.abs(headLength(head(curved.id)) - 10) < 0.01);
});

test("a fragment widens to cover its members, and an outer one covers the inner", () => {
  const d = new DiagramBuilder();
  const a = d.box("A");
  const b = d.box("B");
  d.sequence(
    [a, b],
    [
      {
        fragment: "loop",
        id: "outer",
        steps: [
          {
            fragment: "opt",
            id: "inner",
            steps: [{ from: b, to: b, label: "a long self-message label", id: "self" }],
          },
        ],
      },
    ],
  );
  const out = compile(d, measure);
  assert.deepEqual(codes(out), []);
  const frame = (id: string) => out.frames.find((f) => f.id === id)?.rect;
  const label = out.edges.find((x) => x.id === "self")?.labels[0]?.rect;
  const inner = frame("inner");
  const outer = frame("outer");
  assert.ok(label && inner && outer);
  assert.equal(inner.x + inner.width, label.x + label.width + 8);
  assert.equal(outer.x + outer.width, inner.x + inner.width + 8);
  assert.ok(outer.x <= inner.x && outer.y <= inner.y);
  assert.ok(outer.y + outer.height >= inner.y + inner.height);
});

/** The pairs of edge ids that EDGE_OVERLAP reports for edges among a row of boxes S1, S2, T, U. */
function overlapsIn(edges: (d: DiagramBuilder, s1: Node, s2: Node, t: Node, u: Node) => void) {
  const d = new DiagramBuilder();
  const boxes = ["S1", "S2", "T", "U"].map((label) => d.box(label));
  const [s1, s2, t, u] = boxes;
  assert.ok(s1 && s2 && t && u);
  d.row(boxes);
  edges(d, s1, s2, t, u);
  const out = compile(d, measure);
  const overlaps = out.diagnostics.filter((x) => x.code === "EDGE_OVERLAP");
  if (overlaps[0])
    assert.match(overlaps[0].message, /bend.*port\(\).*ends: "<->"/, "the message names the fixes");
  return overlaps.map((x) => x.ids);
}

test("edges on top of each other are reported", () => {
  assert.deepEqual(
    overlapsIn((d, s1, s2) => {
      d.arrow(s1, s2);
      d.arrow(s2, s1);
    }),
    [["s1->s2", "s2->s1"]],
  );
  assert.deepEqual(
    overlapsIn((d, s1, s2, t, u) => {
      const route = { viaY: s1.bottom.offset(0, 30) };
      d.arrow(s1.bottom, t.bottom, { route, id: "first" });
      d.arrow(s2.bottom, u.bottom, { route, id: "second" });
    }),
    [["first", "second"]],
  );
  assert.deepEqual(
    overlapsIn((d, s1, s2) => {
      d.arrow(s1, s2, { id: "one" });
      d.arrow(s1, s2, { id: "again" });
    }),
    [["one", "again"]],
    "a route that lies wholly on another is neither a fork nor a merge",
  );
});

test("edges that merge into one channel or fork from one are not reported", () => {
  assert.deepEqual(
    overlapsIn((d, s1, s2, t) => {
      const route = { viaY: s1.bottom.offset(0, 30) };
      d.arrow(s1.bottom, t.bottom, { route });
      d.arrow(s2.bottom, t.bottom, { route });
    }),
    [],
  );
  assert.deepEqual(
    overlapsIn((d, s1, s2, t) => {
      const route = { viaY: s1.bottom.offset(0, 30) };
      d.arrow(t.bottom, s1.bottom, { route });
      d.arrow(t.bottom, s2.bottom, { route });
    }),
    [],
  );
});
