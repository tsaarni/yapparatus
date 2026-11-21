/** Figure checks: draw errors, steps and their focus, step-only elements, build, and width. */

import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramBuilder } from "../../../src/diagram/builder.ts";
import { expand } from "../../../src/diagram/drawing.ts";
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
