/** The Lucide icon set that diagrams draw: own icons and aliases, and nothing else. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { lucideIcons } from "../../../src/compiler/lucide-icons.ts";

test("a Lucide name gives its markup, and an alias its parent's", () => {
  const icons = lucideIcons();
  assert.match(icons.body("database") ?? "", /^<g fill="none" stroke="currentColor"/);
  assert.equal(icons.body("alert-circle"), icons.body("circle-exclamation-point"));
  assert.ok(icons.names.includes("database"));
  assert.ok(icons.names.includes("alert-circle"));
  assert.ok(icons.names.length > 2000);
});

test("names that are not icons of the set are unknown", () => {
  const icons = lucideIcons();
  for (const name of ["__proto__", "constructor", "toString", "lucide:database", "search-large"])
    assert.equal(icons.body(name), undefined, name);
  assert.ok(!icons.names.includes("search-large"), "hidden icons are left out");
});
