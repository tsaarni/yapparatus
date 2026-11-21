/** The object a draw program receives: only the calls the diagram reference documents. */

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { DiagramBuilder } from "../../../src/diagram/builder.ts";
import { Scene } from "../../../src/diagram/scene.ts";

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
