/**
 * Figure checks and step states: draw errors, steps and what they focus, edges that follow their
 * ends, step-only elements, build, and width.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramBuilder } from "../../../src/diagram/builder.ts";
import {
  type CompiledDiagram,
  edgeEnds,
  elementState,
  expand,
  stepFocus,
  stepOnlyElements,
} from "../../../src/diagram/drawing.ts";
import { compileFigure } from "../../../src/diagram/figure.ts";
import type { Measure } from "../../../src/diagram/metrics.ts";
import { fixedIcons } from "./fixed-icons.ts";

/** 7 units per character: deterministic stand-in for font measurement. */
const measure: Measure = (text) => text.length * 7;
const lookups = { measure, icons: fixedIcons };

const pair = (d: DiagramBuilder) => {
  const a = d.box("A");
  const b = d.box("B");
  d.row([a, b]);
  d.arrow(a, b);
};

test("a figure without problems has no diagnostics", () => {
  const out = compileFigure(
    { draw: pair, steps: [{ focus: ["a"] }, { id: "then", focus: ["b", "a->b"] }], build: true },
    lookups,
  );
  assert.equal(out.ok, true);
  assert.deepEqual(out.diagnostics, []);
});

test("a draw program that throws is DRAW_FAILED", () => {
  const out = compileFigure(
    {
      draw: () => {
        throw new Error("boom");
      },
      steps: [{ focus: ["missing"] }],
      build: false,
    },
    lookups,
  );
  assert.equal(out.ok, false);
  assert.deepEqual(out.diagnostics, [{ code: "DRAW_FAILED", message: "boom", ids: [] }]);
});

test("a step that focuses a missing element names the elements there are", () => {
  const out = compileFigure({ draw: pair, steps: [{ focus: ["a", "c"] }], build: false }, lookups);
  assert.deepEqual(out.diagnostics, [
    {
      code: "UNKNOWN_ELEMENT",
      message: 'Step 1 focuses "c", which is not an element of this diagram. Elements: a, b, a->b.',
      ids: [],
      subject: "c",
    },
  ]);
  assert.equal(out.ok, true);
});

test("a step id may not repeat an element id or another step id", () => {
  const out = compileFigure(
    {
      draw: pair,
      steps: [
        { id: "a", focus: ["a"] },
        { id: "once", focus: ["b"] },
        { id: "once", focus: ["b"] },
      ],
      build: false,
    },
    lookups,
  );
  assert.deepEqual(
    out.diagnostics.map((d) => [d.code, d.subject]),
    [
      ["DUPLICATE_ID", "a"],
      ["DUPLICATE_ID", "once"],
    ],
  );
});

test("step-only elements: unused ones and those a step shows on top of each other", () => {
  const draw = (d: DiagramBuilder) => {
    const box = d.box("Counter");
    const one = d.note("count = 1", { stepOnly: true, id: "one" });
    const two = d.note("count = 2", { stepOnly: true, id: "two" });
    d.place(one, { below: box });
    d.place(two, { below: box });
  };
  const unused = compileFigure({ draw, steps: [{ focus: ["one"] }], build: false }, lookups);
  assert.deepEqual(
    unused.diagnostics.map((d) => [d.code, d.ids]),
    [["STEP_ONLY_UNUSED", ["two"]]],
  );
  const together = compileFigure(
    { draw, steps: [{ focus: ["one"] }, { focus: ["one", "two"] }], build: false },
    lookups,
  );
  assert.deepEqual(together.diagnostics, [
    {
      code: "NODE_OVERLAP",
      message: "one and two overlap, and step 2 shows both.",
      ids: ["one", "two"],
    },
  ]);
});

/** What decides each element's look in a figure's steps, before one is open. */
function viewOf(out: CompiledDiagram, focus: string[][], build: boolean, preview?: string[]) {
  return {
    steps: focus.map((f) => stepFocus(f, out)),
    build,
    stepOnly: stepOnlyElements(out),
    ends: edgeEnds(out),
    ...(preview ? { preview } : {}),
  };
}

/** The state of each element in each step of a figure, by element. */
function states(out: CompiledDiagram, focus: string[][], ids: string[], build = false) {
  const view = viewOf(out, focus, build);
  return ids.map((id) => view.steps.map((_, active) => elementState(id, { ...view, active })));
}

test("a step-only frame and enclosure appear only in their steps, and unused ones are reported", () => {
  const draw = (d: DiagramBuilder) => {
    const a = d.box("A");
    const b = d.box("B");
    d.row([a, b]);
    d.frame(a.topLeft.offset(-8, -8), a.bottomRight.offset(8, 8), { id: "mark", stepOnly: true });
    d.enclose([b], { id: "group", stepOnly: true });
    d.frame(b.topLeft, b.bottomRight, { id: "spare", stepOnly: true });
    d.enclose([a], { id: "unused", stepOnly: true });
  };
  const out = compileFigure(
    { draw, steps: [{ focus: ["a", "mark"] }, { focus: ["group"] }], build: false },
    lookups,
  );
  assert.deepEqual(
    out.diagnostics.map((d) => [d.code, d.ids]),
    [
      ["STEP_ONLY_UNUSED", ["unused"]],
      ["STEP_ONLY_UNUSED", ["spare"]],
    ],
  );
  assert.deepEqual([...stepOnlyElements(out)].sort(), ["group", "mark", "spare", "unused"]);
  assert.deepEqual(states(out, [["a", "mark"], ["group"]], ["mark", "group", "b"]), [
    ["focus", "absent"],
    ["absent", "focus"],
    ["dim", "focus"],
  ]);
  const closed = viewOf(out, [["a", "mark"], ["group"]], false);
  assert.deepEqual(
    ["mark", "group", "b"].map((id) => elementState(id, { ...closed, active: undefined })),
    ["absent", "absent", undefined],
  );
});

test("a step that shows a step-only enclosure checks the step-only shapes and edges it shows", () => {
  const draw = (d: DiagramBuilder) => {
    const a = d.box("A");
    const b = d.box("B");
    d.row([a, b], { gap: 40 });
    d.enclose([a], { id: "only-a", title: "Only A", stepOnly: true });
    d.place(d.note("Aside", { id: "aside", stepOnly: true }), { at: a.bottom.offset(0, 30) });
    d.arrow(a.top.offset(0, -40), b.top.offset(0, -40), { id: "over", stepOnly: true });
  };
  const steps = [
    { focus: ["only-a"] },
    { focus: ["aside", "over"] },
    { focus: ["only-a", "aside"] },
  ];
  const out = compileFigure({ draw, steps, build: false }, lookups);
  assert.deepEqual(out.diagnostics, [
    {
      code: "ENCLOSURE_INTRUSION",
      message: "aside is not a member of only-a but overlaps its boundary. Step 3 shows both.",
      ids: ["aside", "only-a"],
    },
  ]);
  const both = compileFigure(
    { draw, steps: [{ focus: ["only-a", "aside", "over"] }], build: false },
    lookups,
  );
  assert.deepEqual(
    both.diagnostics.map((d) => [d.code, d.ids]),
    [
      ["ENCLOSURE_TITLE_CROSSED", ["over", "only-a"]],
      ["ENCLOSURE_INTRUSION", ["aside", "only-a"]],
    ],
  );
});

test("a step focuses a container's contents", () => {
  const draw = (d: DiagramBuilder) => {
    const a = d.box("A");
    const note = d.note("only here", { stepOnly: true, id: "note" });
    d.column([a, note], { id: "stack" });
  };
  const out = compileFigure({ draw, steps: [{ focus: ["stack"] }], build: false }, lookups);
  assert.deepEqual(out.diagnostics, []);
  assert.deepEqual([...expand(["stack"], out.groups)].sort(), ["a", "note", "stack"]);
});

test("build without steps is reported", () => {
  const out = compileFigure({ draw: pair, steps: [], build: true }, lookups);
  assert.deepEqual(
    out.diagnostics.map((d) => d.code),
    ["BUILD_WITHOUT_STEPS"],
  );
});

test("a drawing too wide to fit when shrunk is DIAGRAM_SCROLLS", () => {
  const wide = (gap: number) => (d: DiagramBuilder) => {
    d.row([d.box("A"), d.box("B")], { gap });
  };
  const fits = compileFigure({ draw: wide(1000), steps: [], build: false }, lookups);
  assert.ok(fits.viewBox.width * 0.75 <= 960);
  assert.deepEqual(fits.diagnostics, []);
  const out = compileFigure({ draw: wide(1200), steps: [], build: false }, lookups);
  const width = out.viewBox.width;
  assert.deepEqual(out.diagnostics, [
    {
      code: "DIAGRAM_SCROLLS",
      message: `The drawing is ${width} units wide. The widest figure area fits 960 at full size and 1280 when shrunk, so readers must scroll sideways. Stack rows into columns or shorten labels.`,
      ids: [],
    },
  ]);
});

/** Three shapes in a row joined by arrows, a database below, and an enclosure around two. */
const chain = (d: DiagramBuilder) => {
  const client = d.box("Client");
  const api = d.box("API");
  const cache = d.cylinder("Cache");
  const db = d.cylinder("Database");
  d.row([client, api, cache]);
  d.place(db, { below: cache });
  d.arrow(client, api);
  d.arrow(api, cache);
  d.arrow(cache, db);
  d.enclose([cache, db], { id: "backend" });
};

test("a step focuses an edge when it focuses both ends: a row, two shapes, an enclosure", () => {
  const out = compileFigure({ draw: chain, steps: [], build: false }, lookups);
  assert.deepEqual(
    out.edges.map((e) => e.ends),
    [
      ["client", "api"],
      ["api", "cache"],
      ["cache", "database"],
    ],
  );
  const focused = (focus: string[]) =>
    out.edges.map((e) => e.id).filter((id) => stepFocus(focus, out).elements.has(id));
  assert.deepEqual(focused(["row-1"]), ["client->api", "api->cache"]);
  assert.deepEqual(focused(["client", "api"]), ["client->api"]);
  assert.deepEqual(focused(["backend"]), ["cache->database"]);
  assert.deepEqual(focused(["api"]), []);
  assert.deepEqual(focused(["api", "cache->database"]), ["cache->database"]);
});

test("with build, an edge that follows its ends is hidden while an end is hidden", () => {
  const focus = [["client"], ["api"], ["cache", "api->cache"]];
  const out = compileFigure({ draw: chain, steps: [], build: true }, lookups);
  assert.deepEqual(states(out, focus, ["client->api", "api->cache", "database"], true), [
    ["hidden", "dim", "dim"],
    ["hidden", "hidden", "focus"],
    ["dim", "dim", "dim"],
  ]);
  assert.deepEqual(states(out, focus, ["client->api", "api->cache"]), [
    ["dim", "dim", "dim"],
    ["dim", "dim", "focus"],
  ]);
});

test("an end at an element, its outline, or an offset of either counts; others are free", () => {
  const out = compileFigure(
    {
      draw: (d) => {
        const a = d.box("A");
        const b = d.box("B");
        d.row([a, b]);
        d.arrow(a.bottom, b.port("bottom", 0.25), { id: "low", route: { viaY: 100 } });
        d.arrow(a.top.offset(40, 0), b.top.offset(40, 0).offset(0, -4), { id: "shifted" });
        d.arrow(d.xy(a.top, b.top), b.top, { id: "combined" });
        d.arrow(d.lerp(a, b), b.bottom, { id: "between" });
        d.arrow([0, -40], a.top, { id: "free" });
        d.arrow(a, b, { id: "only", stepOnly: true });
      },
      steps: [{ focus: ["only"] }],
      build: false,
    },
    lookups,
  );
  assert.deepEqual(
    out.edges.map((e) => [e.id, e.ends]),
    [
      ["low", ["a", "b"]],
      ["shifted", ["a", "b"]],
      ["combined", undefined],
      ["between", undefined],
      ["free", undefined],
      ["only", undefined],
    ],
  );
  assert.deepEqual([...stepFocus(["a", "b"], out).elements], ["a", "b", "low", "shifted"]);
});

test("an edge between cells follows them, and focusing the records focuses it", () => {
  const out = compileFigure(
    {
      draw: (d) => {
        const users = d.record(["id", "name"], { title: "users" });
        const orders = d.record(["id", "user_id"], { title: "orders" });
        d.row([orders, users]);
        d.arrow(orders.member("user_id"), users.member("id"));
      },
      steps: [],
      build: false,
    },
    lookups,
  );
  assert.deepEqual(out.edges[0]?.ends, ["orders.user_id", "users.id"]);
  assert.ok(stepFocus(["orders", "users"], out).elements.has("orders.user_id->users.id"));
  assert.ok(!stepFocus(["orders"], out).elements.has("orders.user_id->users.id"));
});

test("pointing at a legend entry highlights its elements, not an edge between them", () => {
  const out = compileFigure(
    {
      draw: (d) => {
        const a = d.box("A", { category: "New" });
        const b = d.box("B", { category: "New" });
        d.row([a, b]);
        d.arrow(a, b);
      },
      steps: [{ focus: ["new"] }],
      build: false,
    },
    lookups,
  );
  const preview = out.legend[0]?.elements ?? [];
  const view = viewOf(out, [["new"]], false, preview);
  assert.deepEqual(
    ["a", "b", "a->b"].map((id) => elementState(id, { ...view, active: undefined })),
    ["focus", "focus", "dim"],
  );
  assert.deepEqual(states(out, [["new"]], ["a->b"]), [["focus"]]);
});

test("a step without focus shows the whole figure plain and changes no other step", () => {
  const draw = (d: DiagramBuilder) => {
    const [a, b, c] = [d.box("A"), d.box("B"), d.box("C")];
    d.row([a, b, c]);
    d.arrow(a, b);
    d.enclose([b, c], { id: "group" });
    d.place(d.note("Aside", { id: "aside", stepOnly: true }), { below: c });
  };
  const focus = [["c", "aside"], [], ["a", "b"]];
  const out = compileFigure(
    { draw, steps: focus.map((f) => ({ focus: f })), build: true },
    lookups,
  );
  assert.deepEqual(out.diagnostics, []);
  assert.deepEqual(stepFocus([], out), { elements: new Set(), whole: true });
  const ids = ["a", "a->b", "aside", "c", "group"];
  assert.deepEqual(states(out, focus, ids, true), [
    ["hidden", undefined, "focus"],
    ["hidden", undefined, "focus"],
    ["focus", "absent", "absent"],
    ["focus", undefined, "dim"],
    ["dim", undefined, "dim"],
  ]);
  const opening = [[], ["c"], ["a", "b"]];
  assert.deepEqual(states(out, opening, ids, true), [
    [undefined, "hidden", "focus"],
    [undefined, "hidden", "focus"],
    ["absent", "absent", "absent"],
    [undefined, "focus", "dim"],
    [undefined, "dim", "dim"],
  ]);
});

test("a step-only element that only a step without focus could show is STEP_ONLY_UNUSED", () => {
  const out = compileFigure(
    {
      draw: (d) => {
        const a = d.box("A");
        d.place(d.note("Aside", { id: "aside", stepOnly: true }), { below: a });
      },
      steps: [{ focus: ["a"] }, { focus: [] }],
      build: false,
    },
    lookups,
  );
  assert.deepEqual(
    out.diagnostics.map((x) => [x.code, x.ids]),
    [["STEP_ONLY_UNUSED", ["aside"]]],
  );
});

test("with build, a shape that has an edge and that no step focuses is BUILD_NEVER_FOCUSED", () => {
  const draw = (d: DiagramBuilder) => {
    const [a, b, c] = [d.box("A"), d.box("B"), d.box("C")];
    d.row([a, b, c]);
    d.arrow(a, b);
    d.enclose([a, b], { id: "group" });
  };
  const run = (build: boolean, ...focus: string[][]) =>
    compileFigure({ draw, steps: focus.map((f) => ({ focus: f })), build }, lookups).diagnostics;
  assert.deepEqual(run(true, ["a"]), [
    {
      code: "BUILD_NEVER_FOCUSED",
      message:
        "b has an edge, but no step focuses it, so build shows it faded from the first step. Focus it in the step where it should appear.",
      ids: ["b"],
    },
  ]);
  assert.deepEqual(run(false, ["a"]), []);
  assert.deepEqual(run(true, ["a"], ["b"]), []);
  assert.deepEqual(
    run(true, ["a"], []).map((x) => x.ids),
    [["b"]],
    "a step without focus focuses no shape",
  );
});
