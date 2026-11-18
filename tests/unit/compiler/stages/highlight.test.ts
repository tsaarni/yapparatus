/** Highlighting: page line numbers for code blocks, and the whole file for the file view. */

import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { compile } from "@mdx-js/mdx";
import { codeHighlighting, fileView } from "../../../../src/compiler/stages/highlight.ts";
import { sourceContext } from "../../../../src/compiler/stages/source-context.ts";
import { parseFileAddress } from "../../../../src/document/file-address.ts";
import { withProject } from "../../project.ts";
import { codeBlocks, textOf } from "./code-blocks.ts";

test("each line of a page's code block carries its line in the page, without a number", () =>
  withProject(async (root) => {
    const page = [
      "# Page",
      "",
      "- Item:",
      "",
      "  ```ts",
      "  // [!code highlight:1]",
      "  const a = 1;",
      "  const b = 2;",
      "  ```",
      "",
    ].join("\n");
    const file = path.join(root, "content/page.mdx");
    writeFileSync(file, page);
    const js = String(
      await compile(
        { value: page, path: file },
        {
          outputFormat: "function-body",
          rehypePlugins: [sourceContext(() => root), codeHighlighting],
        },
      ),
    );
    const [code] = await codeBlocks(js);
    assert.deepEqual(code?.pageLines, [7, 8]);
    assert.deepEqual(code?.marks, { 0: "highlight" });
    assert.equal(code?.start, undefined);
  }));

test("the file view carries the whole file, numbered, with each token style once", () =>
  withProject(async (_root, files) => {
    const address = parseFileAddress("/-/files/app/src/main.ts");
    assert.ok(address);
    const source = files.read(address);
    assert.ok(!("error" in source));
    const view = await fileView(address, source);
    assert.equal(view.address, "/-/files/app/src/main.ts");
    assert.equal(view.code.language, "ts");
    assert.equal(view.code.start, 1);
    assert.deepEqual(view.code.lines.map(textOf), source.lines);
    assert.equal(new Set(view.code.styles).size, view.code.styles.length);
    for (const line of view.code.lines)
      for (let i = 0; i < line.length; i += 2) {
        assert.equal(typeof line[i], "number");
        assert.ok(view.code.styles[line[i] as number] !== undefined);
      }
  }));
