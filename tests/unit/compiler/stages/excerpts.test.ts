import assert from "node:assert/strict";
import { test } from "node:test";
import { compile } from "@mdx-js/mdx";
import { contentIssues } from "../../../../src/compiler/stages/conventions.ts";
import { excerptRange, excerpts } from "../../../../src/compiler/stages/excerpts.ts";
import { codeHighlighting } from "../../../../src/compiler/stages/highlight.ts";
import { withProject } from "../../project.ts";
import { codeBlocks, textOf } from "./code-blocks.ts";

test("an excerpt shows its file's lines with their numbers, exactly as written", () =>
  withProject(async (_root, files) => {
    const compileExcerpt = async (tag: string) => {
      const file = `/virtual/${Math.random()}.mdx`;
      const js = String(
        await compile(
          { value: tag, path: file },
          {
            outputFormat: "function-body",
            rehypePlugins: [excerpts(files), codeHighlighting],
          },
        ),
      );
      return { code: (await codeBlocks(js))[0], issues: contentIssues.get(file) ?? [] };
    };
    const { code, issues } = await compileExcerpt(
      '<Excerpt from="/-/files/app/src/main.ts" start="const text" end="return" mark="return" />',
    );
    assert.deepEqual(issues, []);
    assert.equal(code?.language, "ts");
    assert.equal(code?.start, 2);
    assert.equal(code?.lines.length, 2);
    assert.deepEqual(code?.marks, { 1: "highlight" });
    // The file's own text is shown as written, notation included.
    assert.match(textOf(code?.lines[0]), /\[!code highlight\]$/);
    // Without end, the excerpt is the block its first line opens, closing brace included.
    const block = await compileExcerpt(
      '<Excerpt from="/-/files/app/src/main.ts" start="export function greet(" mark={["const", "return"]} />',
    );
    assert.deepEqual(block.issues, []);
    assert.equal(block.code?.start, 1);
    assert.equal(textOf(block.code?.lines.at(-1)), "}");
    assert.deepEqual(block.code?.marks, { 1: "highlight", 2: "highlight" });
    const message = async (tag: string) => (await compileExcerpt(tag)).issues[0]?.message ?? "";
    assert.match(
      await message('<Excerpt from="/-/files/app/src/main.ts" start="text" />'),
      /in 2 lines, L2, L3\. Quote more/,
    );
    assert.match(
      await message('<Excerpt from="/-/files/app/src/main.ts" start="retry" />'),
      /in no line of the file/,
    );
    assert.match(
      await message('<Excerpt from="/-/files/app/src/main.ts" start="greet(" mark="retry" />'),
      /mark="retry"> is in no line of the excerpt, L1 to L4/,
    );
    assert.match(
      await message('<Excerpt from="/-/files/app/src/main.ts#L2-L3" />'),
      /names lines by number/,
    );
    assert.match(await message('<Excerpt from="main.ts" />'), /not a file address/);
    const wrapped = await compileExcerpt(
      '<Excerpt from="/-/files/app/src/main.ts" start="export function greet(" wrap />',
    );
    assert.deepEqual(wrapped.issues, []);
    assert.match(
      await message('<Excerpt from="/-/files/app/src/main.ts" start="greet(" wrap="yes" />'),
      /a bare wrap/,
    );
  }));

test("an excerpt's block follows indentation, and a closing line that opens again continues it", () => {
  const lines = [
    "function run(",
    "  options: Options,",
    ") {",
    "  if (options.fast) {",
    "    go();",
    "  } else {",
    "    wait();",
    "  }",
    "}",
    "",
    "def handle(request):",
    "    if request:",
    "        reply()",
    "",
    "    return None",
    "after = 1",
  ];
  assert.deepEqual(excerptRange(lines, "function run(", undefined), { start: 1, end: 9 });
  assert.deepEqual(excerptRange(lines, "if (options.fast)", undefined), { start: 4, end: 8 });
  assert.deepEqual(excerptRange(lines, "def handle(", undefined), { start: 11, end: 15 });
  assert.deepEqual(excerptRange(lines, "after = 1", undefined), { start: 16, end: 16 });
  assert.deepEqual(excerptRange(lines, "options: Options", ") {"), { start: 2, end: 3 });
});

test("an excerpt's block takes a brace on its own line and preprocessor lines in column 0", () => {
  const lines = [
    "void run()",
    "{",
    "  a();",
    "#ifdef FAST",
    "  b();",
    "#endif",
    "}",
    "",
    "# A comment before the next block.",
    "after = 1",
  ];
  assert.deepEqual(excerptRange(lines, "void run()", undefined), { start: 1, end: 7 });
  assert.deepEqual(excerptRange(lines, "after = 1", undefined), { start: 10, end: 10 });
  assert.deepEqual(
    excerptRange(["def f():", "    x = 1", "# next", "def g():"], "def f():", undefined),
    { start: 1, end: 2 },
  );
});
