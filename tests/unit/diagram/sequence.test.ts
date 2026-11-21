/** Sequences create their elements through the scene: categories and the element limit apply. */

import assert from "node:assert/strict";
import { test } from "node:test";
import { DiagramBuilder } from "../../../src/diagram/builder.ts";
import { compile } from "../../../src/diagram/compile/compile.ts";
import { compileFigure } from "../../../src/diagram/figure.ts";
import type { Measure } from "../../../src/diagram/metrics.ts";
import { Scene } from "../../../src/diagram/scene.ts";
import type { SequenceStep } from "../../../src/diagram/sequence.ts";
import { fixedIcons } from "./fixed-icons.ts";

/** 7 units per character: deterministic stand-in for font measurement. */
const measure: Measure = (text) => text.length * 7;
const lookups = { measure, icons: fixedIcons };

test("a sequence message with a category has a color, a legend entry, and a step focus", () => {
  const out = compileFigure(
    {
      draw: (d) => {
        const a = d.box("Client");
        const b = d.box("API");
        d.sequence(
          [a, b],
          [
            { from: a, to: b, label: "get item", category: "New" },
            { from: b, to: a, label: "item", reply: true },
          ],
        );
      },
      steps: [{ focus: ["new"] }],
      build: false,
    },
    lookups,
  );
  assert.deepEqual(out.diagnostics, []);
  assert.equal(out.edges.find((e) => e.id === "get-item")?.category, 1);
  assert.equal(out.edges.find((e) => e.id === "item")?.category, undefined);
  assert.deepEqual(out.legend, [{ name: "New", id: "new", slot: 1, elements: ["get-item"] }]);
  assert.deepEqual(out.groups.new, ["get-item"]);
});

test("a sequence with more messages than the element limit is DRAW_FAILED when created", () => {
  const messages = (d: DiagramBuilder): SequenceStep[] => {
    const a = d.box("A");
    const b = d.box("B");
    return Array.from({ length: 2500 }, (_, i) => ({ from: a, to: b, label: `m${i}` }));
  };
  const out = compileFigure(
    {
      draw: (d) => {
        const steps = messages(d);
        const [first] = steps;
        if (first && "from" in first) d.sequence([first.from, first.to], steps);
      },
      steps: [],
      build: false,
    },
    lookups,
  );
  assert.deepEqual(out.diagnostics, [
    { code: "DRAW_FAILED", message: "The drawing has more than 2000 elements.", ids: [] },
  ]);

  const scene = new Scene();
  const d = new DiagramBuilder(scene);
  const steps = messages(d);
  const [first] = steps;
  assert.ok(first && "from" in first);
  assert.throws(() => d.sequence([first.from, first.to], steps));
  assert.equal(scene.nodes.length + scene.edges.length + scene.grids.length, 2000);
});

test("two participants with the same label have their own lifelines", () => {
  const scene = new Scene();
  const d = new DiagramBuilder(scene);
  const a = d.box("API");
  const b = d.box("API");
  d.sequence([a, b], [{ from: a, to: b, label: "call" }]);
  const out = compile(scene, lookups);
  assert.deepEqual(out.diagnostics, []);
  assert.deepEqual(
    out.edges.filter((e) => e.passive).map((e) => e.id),
    ["api-lifeline", "api-2-lifeline"],
  );
});

test("a sequence's elements are named after their owners", () => {
  const scene = new Scene();
  const d = new DiagramBuilder(scene);
  const client = d.box("Client");
  const api = d.box("API");
  const db = d.cylinder("DB");
  const first = d.sequence(
    [client, api, db],
    [
      { from: client, to: api, label: "get" },
      { from: api, to: db, label: "read" },
      { from: db, to: api, label: "rows", reply: true },
      { from: api, to: client, label: "item", reply: true },
      { from: client, to: api, label: "put" },
      {
        fragment: "loop",
        title: "until empty",
        steps: [{ from: api, to: db, label: "drain" }],
      },
    ],
  );
  const x = d.box("X");
  const y = d.box("Y");
  const second = d.sequence([x, y], [{ from: x, to: y, label: "ping" }], { id: "pings" });
  d.column([first, second]);
  const out = compile(scene, lookups);
  assert.deepEqual(out.diagnostics, []);
  assert.deepEqual([first.id, second.id], ["sequence-1", "pings"]);
  assert.deepEqual(
    out.nodes.filter((n) => n.passive).map((n) => n.id),
    [
      "api-active-1",
      "db-active-1",
      "api-active-2",
      "db-active-2",
      "sequence-1-space",
      "y-active-1",
      "pings-space",
    ],
  );
  assert.deepEqual(
    scene.grids.map((g) => g.id),
    ["sequence-1-participants", "sequence-1", "pings-participants", "pings", "column-1"],
  );
  assert.deepEqual(
    out.frames.map((f) => f.id),
    ["loop-until-empty"],
  );
  assert.ok(out.groups["loop-until-empty"]?.includes("drain"));
});
