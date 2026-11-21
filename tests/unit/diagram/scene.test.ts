/** The scene: what positions an element, and problems reported with the elements' final ids. */

import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramBuilder } from "../../../src/diagram/builder.ts";
import { compileFigure } from "../../../src/diagram/figure.ts";
import type { Measure } from "../../../src/diagram/metrics.ts";
import { fixedIcons } from "./fixed-icons.ts";

/** 7 units per character: deterministic stand-in for font measurement. */
const measure: Measure = (text) => text.length * 7;

/** Compile a draw program, as the page compiler does without steps. */
function drawn(draw: (d: DiagramBuilder) => void) {
  return compileFigure({ draw, steps: [], build: false }, { measure, icons: fixedIcons });
}

test("a placed cell is NOT_PLACEABLE, and it stays in its record", () => {
  const alone = drawn((d) => {
    d.record(["a", "b"]);
  });
  const out = drawn((d) => {
    const rec = d.record(["a", "b"]);
    const x = d.box("X");
    d.place(x, { rightOf: rec });
    d.place(rec.element("a"), { below: x });
  });
  assert.deepEqual(out.diagnostics, [
    {
      code: "NOT_PLACEABLE",
      message:
        "place() positions record-1.a, which is a cell of record-1; its bounds come from its parent. Position record-1 instead.",
      ids: ["record-1.a"],
    },
  ]);
  const rect = (o: typeof out, id: string) => o.nodes.find((n) => n.id === id)?.rect;
  assert.deepEqual(rect(out, "record-1.a"), rect(alone, "record-1.a"));
  assert.ok(rect(out, "x"));
});

test("an enclosure or a mark in a row is NOT_PLACEABLE, and the row leaves its cell empty", () => {
  const out = drawn((d) => {
    const a = d.box("A");
    const t = d.text("one two", { marks: { two: "two" } });
    const group = d.enclose([a], { title: "Group" });
    d.column([d.row([a, group, t.element("two")]), t]);
  });
  assert.deepEqual(out.diagnostics, [
    {
      code: "NOT_PLACEABLE",
      message:
        "row(row-1) positions group, which is an enclosure; its bounds come from its members. Position the members instead.",
      ids: ["group"],
    },
    {
      code: "NOT_PLACEABLE",
      message:
        "row(row-1) positions one-two.two, which is a mark of one-two; its bounds come from its parent. Position one-two instead.",
      ids: ["one-two.two"],
    },
  ]);
  assert.deepEqual(out.groups["row-1"], ["a"]);
});

test("a problem a call reports names the final id of its element", () => {
  const out = drawn((d) => {
    const a = d.box("A");
    const b = d.box("A", { replicas: 9 });
    d.row([a, b]);
  });
  assert.deepEqual(out.diagnostics, [
    {
      code: "INVALID_REPLICAS",
      message:
        "a-2 has replicas: 9, but a stack draws 2 to 4 boxes. For more, or an unknown number, put the number in the label of a box with replicas: 4.",
      ids: ["a-2"],
    },
  ]);
});

test("one compile reports every mistake and draws the rest of the figure", () => {
  const out = drawn((d) => {
    const client = d.box("Client");
    const api = d.box("API");
    const db = d.cylinder("Database");
    const s = d.sequence(
      [client, api],
      [
        { from: client, to: db, label: "query" },
        { from: client, to: api, label: "get" },
      ],
    );
    const t = d.tree(d.box("Root"), [d.box("Leaf")], { layout: "up" as never });
    d.equalSize([client, t as never]);
    d.column([s, t, db]);
  });
  assert.deepEqual(
    out.diagnostics.map((x) => [x.code, x.ids, x.subject]),
    [
      ["UNKNOWN_PARTICIPANT", ["sequence-1", "database"], "steps[0].to"],
      ["INVALID_ARGUMENT", ["root-tree"], "layout"],
      ["INVALID_ARGUMENT", ["root-tree"], "nodes[1]"],
    ],
  );
  assert.equal(out.ok, false);
  assert.deepEqual(
    out.nodes.filter((n) => !n.passive).map((n) => n.id),
    ["client", "api", "database", "root", "leaf"],
  );
  assert.deepEqual(
    out.edges.filter((e) => !e.passive).map((e) => e.id),
    ["get", "root->leaf"],
  );
});
