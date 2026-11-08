import assert from "node:assert/strict";
import { test } from "node:test";
import { compile, type Measure } from "../src/diagram/compile.ts";
import { DiagramBuilder } from "../src/diagram/scene.ts";

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
  // B's bar runs from the call to the reply.
  assert.ok(Math.abs(bBar.rect.y - (call.points[0]?.y ?? 0)) < 1);
  assert.ok(Math.abs(bBar.rect.y + bBar.rect.height - (done.points[0]?.y ?? 0)) < 1);
  // The unanswered "store" call gives C a short bar; the async "notify" gives it none.
  assert.equal(barOf("c").length, 1);
  assert.ok((barOf("c")[0]?.rect.height ?? 99) < 44);
  // Replies are dashed with open heads; the fragment becomes a frame with its tab.
  assert.equal(done.dashed, true);
  assert.equal(done.head, "open");
  const frame = out.frames[0];
  assert.equal(frame?.tab?.line.text, "loop");
  assert.equal(frame?.title?.text, "[retry]");
  // The tab is measured: it fits its text, and the title starts after it.
  assert.ok(frame?.tab && frame.title);
  assert.ok(frame.tab.rect.width >= measure("loop", { family: "", size: 11, weight: 600 }) + 8);
  assert.ok(frame.title.x >= frame.tab.rect.x + frame.tab.rect.width);
});

test("record rows have anchors; shapes snap to their own outline", () => {
  const d = new DiagramBuilder();
  const rec = d.record("Message", ["seq", "author", "text"], { id: "message" });
  const choice = d.decision("Same page?", { id: "choice" });
  d.row([rec, choice], { gap: 80 });
  const link = d.arrow(rec.row(2), choice, { id: "link" });
  const out = compile(d, measure);
  const r = out.nodes.find((n) => n.id === "message")?.rect;
  const edge = out.edges.find((e) => e.id === link.id);
  assert.ok(r && edge);
  const start = edge.points[0];
  assert.equal(start?.x, r.x + r.width);
  assert.ok(start && start.y > r.y + r.height / 2, "row 2 is in the lower half");
  assert.equal(out.nodes.find((n) => n.id === "message")?.lines.length, 4);
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

test("containers list their members for steps: enclosures, stacks, sequences, fragments", () => {
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

test("step-only parts may share a place without overlap warnings", () => {
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
  // Storage has no color of its own: it is neutral until given a category.
  assert.equal(node("database")?.category, undefined);
  assert.equal(node("database")?.role, "default");
  assert.deepEqual(
    out.legend.map((e) => [e.name, e.id, e.slot, e.parts]),
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

test("categories: an id a part already has cannot name a category for steps", () => {
  const d = new DiagramBuilder();
  d.box("Cache", { category: "Cache" });
  const out = compile(d, measure);
  assert.deepEqual(codes(out), ["CATEGORY_ID_TAKEN"]);
  assert.equal(out.groups.cache, undefined);
});

test("start and end labels sit beside the dot without moving it, and take part in checks", () => {
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
  // The dot alone is centered in the column; its label hangs to the right.
  assert.equal(dot.rect.x + dot.rect.width / 2, box.x + box.width / 2);
  assert.equal(dot.labelRect.x, dot.rect.x + dot.rect.width + 8);
  assert.equal(dot.lines[0]?.text, "Clicked");
  assert.ok(out.viewBox.x + out.viewBox.width >= dot.labelRect.x + dot.labelRect.width);
  assert.ok(node("end-3"), "an unlabeled end keeps its numbered id");

  // An edge that leaves through its own label is reported.
  const e = new DiagramBuilder();
  const s = e.start("Go", { side: "below" });
  const b = e.box("Next");
  e.column([s, b]);
  e.arrow(s, b);
  assert.ok(codes(compile(e, measure)).includes("EDGE_NODE_INTERSECTION"));
});
