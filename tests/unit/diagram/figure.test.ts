/** Figure checks: draw errors, steps and their focus, step-only elements, build, and width. */

import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramBuilder } from "../../../src/diagram/builder.ts";
import { elementState, expand, stepOnlyElements } from "../../../src/diagram/drawing.ts";
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
  const steps = [expand(["a", "mark"], out.groups), expand(["group"], out.groups)];
  const stepOnly = stepOnlyElements(out);
  assert.deepEqual([...stepOnly].sort(), ["group", "mark", "spare", "unused"]);
  const states = (active: number | undefined) =>
    ["mark", "group", "b"].map((id) => elementState(id, { steps, active, build: false, stepOnly }));
  assert.deepEqual(states(undefined), ["absent", "absent", undefined]);
  assert.deepEqual(states(0), ["focus", "absent", "dim"]);
  assert.deepEqual(states(1), ["absent", "focus", "focus"]);
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
