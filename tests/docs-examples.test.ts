/**
 * Agents copy the examples in the diagram reference, so every example must draw. Each
 * `js` block is a draw program; each `mdx` block is a `<Diagram>` whose draw program
 * compiles and whose steps focus elements it has.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { compile } from "../src/diagram/compile.ts";
import type { Measure } from "../src/diagram/metrics.ts";
import { DiagramBuilder } from "../src/diagram/scene.ts";
import { diagnosticCodes } from "../src/document/diagnostic.ts";
import { examples, examplePages as pages } from "./diagram-examples.ts";

const measure: Measure = (text) => text.length * 7;

test("the diagram reference has pages with examples", () => {
  assert.deepEqual(pages.sort(), ["diagram-sequences.md", "diagram-structures.md", "diagrams.md"]);
  for (const page of pages) assert.ok(examples(page).length > 0, page);
});

for (const page of pages)
  examples(page).forEach(({ draw, focus }, i) => {
    test(`${page}: example ${i + 1} draws, and its steps focus its elements`, () => {
      assert.ok(draw.trim(), "an mdx example has a draw program");
      const d = new DiagramBuilder();
      new Function("d", draw)(d);
      const out = compile(d, measure);
      const errors = out.diagnostics.filter((x) => diagnosticCodes[x.code].severity === "error");
      assert.deepEqual(errors, []);
      const elements = new Set([
        ...[...out.nodes, ...out.edges, ...out.enclosures].map((p) => p.id),
        ...Object.keys(out.groups),
      ]);
      assert.deepEqual(
        focus.filter((id) => !elements.has(id)),
        [],
      );
    });
  });
