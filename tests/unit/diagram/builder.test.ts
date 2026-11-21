/**
 * The object a draw program receives: only the calls the diagram reference documents, which
 * report a value they cannot use and continue with a stand-in.
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { DiagramBuilder } from "../../../src/diagram/builder.ts";
import { compileFigure } from "../../../src/diagram/figure.ts";
import type { Measure } from "../../../src/diagram/metrics.ts";
import { Scene } from "../../../src/diagram/scene.ts";
import { fixedIcons } from "./fixed-icons.ts";

const docs = path.join(import.meta.dirname, "../../../starter/docs");

/** The text of the diagram reference's pages. */
const reference = readdirSync(docs)
  .filter((f) => /^diagram.*\.md$/.test(f))
  .map((f) => readFileSync(path.join(docs, f), "utf8"))
  .join("\n");

test("d has no property that is not a documented call", () => {
  const d = new DiagramBuilder(new Scene());
  assert.deepEqual(Object.getOwnPropertyNames(d), []);
  const prototype = Object.getPrototypeOf(d);
  assert.equal(Object.getPrototypeOf(prototype), Object.prototype);
  const calls = Object.getOwnPropertyNames(prototype).filter((name) => name !== "constructor");
  for (const name of calls) {
    assert.equal(typeof d[name as keyof DiagramBuilder], "function", name);
    assert.ok(
      reference.includes(`d.${name}(`) || reference.includes(`\`${name}\``),
      `d.${name} is not in the diagram reference`,
    );
  }
  assert.ok(calls.includes("box") && calls.includes("sequence") && calls.includes("tree"));
});

/** 7 units per character: deterministic stand-in for font measurement. */
const measure: Measure = (text) => text.length * 7;

/** Compile a draw program, as the page compiler does without steps. */
function drawn(draw: (d: DiagramBuilder) => void) {
  return compileFigure({ draw, steps: [], build: false }, { measure, icons: fixedIcons });
}

test("a size group leaves out what is not a shape and reports it with its final id", () => {
  const out = drawn((d) => {
    const a = d.box("A", { width: 200 });
    const b = d.box("B");
    const row = d.row([d.box("C")]);
    d.equalSize([a, row as never, b]);
    d.column([a, b, row]);
  });
  assert.deepEqual(out.diagnostics, [
    {
      code: "INVALID_ARGUMENT",
      message: "equalSize: nodes[1] is row-1, a row, but it takes a shape. nodes[1] is left out.",
      ids: ["row-1"],
      subject: "nodes[1]",
    },
  ]);
  const width = (id: string) => out.nodes.find((n) => n.id === id)?.rect.width;
  assert.equal(width("b"), 200);
  assert.notEqual(width("c"), 200);
});

test("a viaX or viaY that is not a number or a point is reported, and the edge is straight", () => {
  const out = drawn((d) => {
    const a = d.box("A");
    const b = d.box("B");
    const c = d.box("C");
    d.column([a, b, c]);
    d.place(d.box("D"), { rightOf: b });
    d.arrow(a, b, { route: { viaX: "c" as never } });
    d.arrow(b, c, { route: { viaY: [0, Number.NaN] } });
  });
  const wrong = out.diagnostics.filter((x) => x.code === "INVALID_ARGUMENT");
  assert.deepEqual(wrong, [
    {
      code: "INVALID_ARGUMENT",
      message:
        'arrow a->b: route.viaX is "c", but it takes a number or a point, a shape, a grid, an enclosure, a frame, or [x, y]. The default is used.',
      ids: ["a->b"],
      subject: "route.viaX",
    },
    {
      code: "INVALID_ARGUMENT",
      message:
        "arrow b->c: route.viaY is a list of 2, but it takes a number or a point, a shape, a grid, an enclosure, a frame, or [x, y]. The default is used.",
      ids: ["b->c"],
      subject: "route.viaY",
    },
  ]);
  assert.deepEqual(
    out.edges.map((e) => [e.id, e.points.length]),
    [
      ["a->b", 2],
      ["b->c", 2],
    ],
  );
  assert.deepEqual(
    out.nodes.map((n) => n.id),
    ["a", "b", "c", "d"],
  );
});

test("an edge that ends at a frame attaches to the frame's outline", () => {
  const out = drawn((d) => {
    const a = d.box("A");
    const b = d.box("B");
    const c = d.box("C");
    d.row([a, b]);
    const frame = d.frame(a.topLeft.offset(-10, -30), b.bottomRight.offset(10, 10), {
      tab: "group",
    });
    d.place(c, { below: frame, gap: 40 });
    d.arrow(c, frame);
    d.line(frame.port("left"), [-100, 13]);
  });
  assert.deepEqual(out.diagnostics, []);
  const rect = out.frames.find((f) => f.id === "group")?.rect;
  assert.deepEqual(rect, { x: -10, y: -30, width: 316, height: 86 });
  assert.equal(out.nodes.find((n) => n.id === "c")?.rect.y, 56 + 40);
  assert.deepEqual(
    out.edges.map((e) => [e.id, e.points[0], e.points.at(-1)]),
    [
      ["c->group", { x: 148, y: 96 }, { x: 148, y: 61.5 }],
      ["group->-100,13", { x: -10, y: 13 }, { x: -100, y: 13 }],
    ],
  );
  const tip = out.edges[0]?.head?.points[0];
  assert.deepEqual(tip, { x: 148, y: 56 });
});
