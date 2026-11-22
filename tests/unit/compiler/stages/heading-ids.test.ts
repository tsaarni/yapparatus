/** The heading-ids stage: headings take ids from their text, after the page's block ids. */

import assert from "node:assert/strict";
import { test } from "node:test";
import { compile } from "@mdx-js/mdx";
import { contentIssues } from "../../../../src/compiler/stages/conventions.ts";
import { headingIds } from "../../../../src/compiler/stages/heading-ids.ts";
import { compiled, pageOutline } from "../../../../src/compiler/stages/outline.ts";

/** Compile a page with heading ids and its outline; returns the outline and the issues found. */
async function build(source: string) {
  const file = `/virtual/${Math.random()}.mdx`;
  await compile(
    { value: source, path: file },
    { rehypePlugins: [headingIds, [pageOutline, () => true]] },
  );
  return { outline: compiled.get(file)?.outline, issues: contentIssues.get(file) ?? [] };
}

test("a heading that would share a figure's id takes a suffix, and the figure keeps the id", async () => {
  const { outline, issues } = await build(
    '# Page\n\n## Components\n\n<Figure id="components" caption="The parts.">x</Figure>\n',
  );
  assert.deepEqual(issues, []);
  assert.deepEqual(
    outline?.headings.map((h) => h.id),
    ["components-1"],
  );
  assert.ok(outline?.anchors.includes("components"));
});

test("repeated headings are numbered, and other headings keep their text's id", async () => {
  const { outline } = await build("# Page\n\n## Setup\n\n## Setup\n\n### Install the CLI\n");
  assert.deepEqual(
    outline?.headings.map((h) => h.id),
    ["setup", "setup-1", "install-the-cli"],
  );
});

test("two blocks with one id on a page are still a duplicate", async () => {
  const { issues } = await build(
    '# Page\n\n<Table id="routes" caption="A.">\n\n| a |\n|---|\n| 1 |\n\n</Table>\n\n<Listing id="routes" caption="B.">\n\n```ts\nx\n```\n\n</Listing>\n',
  );
  assert.deepEqual(
    issues.map((i) => i.code),
    ["DUPLICATE_ID"],
  );
});
