import assert from "node:assert/strict";
import { test } from "node:test";
import { compile, run } from "@mdx-js/mdx";
import rehypeShiki from "@shikijs/rehype";
import { createElement } from "react";
import * as runtime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import remarkGfm from "remark-gfm";
import { codeMarks, contentIssues, markdownConventions } from "../src/markdown-plugin.ts";

/** Compile MDX with the conventions and highlighting; returns the JS and the issues found. */
async function build(source: string, outputFormat: "program" | "function-body" = "program") {
  const file = `/virtual/${Math.random()}.mdx`;
  const js = String(
    await compile(
      { value: source, path: file },
      {
        outputFormat,
        remarkPlugins: [remarkGfm],
        rehypePlugins: [
          markdownConventions,
          [
            rehypeShiki,
            {
              theme: "github-dark",
              langs: ["ts"],
              lazy: true,
              defaultLanguage: "text",
              fallbackLanguage: "text",
              transformers: [codeMarks],
            },
          ],
        ],
      },
    ),
  );
  return { js, issues: contentIssues.get(file) ?? [] };
}

const fence = "```";

let treeEntries: unknown;
function StubTree({ entries }: { entries: unknown }) {
  treeEntries = entries;
  return null;
}

test("alerts: the marker becomes the kind, on its own line or before the text", async () => {
  const { js, issues } = await build(
    "> [!NOTE]\n> Read **this** first.\n\n> [!WARNING] Back up first.\n\n> A plain quote.\n",
  );
  assert.deepEqual(issues, []);
  assert.match(js, /"data-alert": "note"/);
  assert.match(js, /"data-alert": "warning"/);
  assert.equal((js.match(/data-alert/g) ?? []).length, 2);
  assert.doesNotMatch(js, /\[!NOTE\]|\[!WARNING\]/);
  assert.match(js, /"Back up first\."/);
});

test("alerts: an unknown kind stays a quote and is reported", async () => {
  const { js, issues } = await build("> [!HINT]\n> Try this.\n");
  assert.doesNotMatch(js, /data-alert/);
  assert.equal(issues[0]?.code, "ALERT_TYPE");
  assert.equal(issues[0]?.subject, "HINT");
});

test("code blocks name a language Shiki knows", async () => {
  const { issues } = await build(
    `${fence}\nplain\n${fence}\n\n${fence}toml\na = 1\n${fence}\n\n${fence}text\nok\n${fence}\n\n${fence}tomll\nb = 2\n${fence}\n`,
  );
  assert.deepEqual(
    issues.map((i) => [i.code, i.subject, i.line]),
    [
      ["CODE_LANGUAGE", "", 1],
      ["CODE_LANGUAGE", "tomll", 13],
    ],
  );
});

test("headings deeper than ### are reported", async () => {
  const { issues } = await build("## Fine\n\n### Fine\n\n#### Too deep\n");
  assert.deepEqual(
    issues.map((i) => [i.code, i.subject]),
    [["HEADING_DEPTH", "Too deep"]],
  );
});

test("code marks: end-of-line comments, counts, and comment-only lines, in any language", async () => {
  const { js } = await build(
    [
      `${fence}json`,
      "{",
      '  "a": 1, // [!code --]',
      '  "b": 2 // [!code ++]',
      "}",
      fence,
      "",
      `${fence}ts`,
      "// [!code highlight:2]",
      "const a = 1;",
      "const b = 2;",
      "const c = 3; /* [!code highlight] */",
      fence,
    ].join("\n"),
  );
  const marks = [...js.matchAll(/"data-mark": "(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(marks, ["remove", "add", "highlight", "highlight", "highlight"]);
  assert.doesNotMatch(js, /\[!code/);
});

test("FileTree: the list becomes entries; names, comments, folders, and bold", async () => {
  const { js, issues } = await build(
    [
      "<FileTree>",
      "",
      "- src/",
      "  - **index.ts** the entry point",
      "  - lib",
      "    - util.ts",
      "  - …",
      "- package.json",
      "",
      "</FileTree>",
    ].join("\n"),
    "function-body",
  );
  assert.deepEqual(issues, []);
  // Render the page and read the entries it gives FileTree.
  const { default: Content } = await run(js, { ...runtime, baseUrl: import.meta.url });
  treeEntries = undefined;
  renderToStaticMarkup(createElement(Content, { components: { FileTree: StubTree } }));
  assert.deepEqual(treeEntries, [
    {
      name: "src",
      kind: "directory",
      children: [
        { name: "index.ts", kind: "file", comment: "the entry point", highlight: true },
        { name: "lib", kind: "directory", children: [{ name: "util.ts", kind: "file" }] },
        { name: "…", kind: "more" },
      ],
    },
    { name: "package.json", kind: "file" },
  ]);
});

test("FileTree without a list is reported", async () => {
  const { issues } = await build("<FileTree>\nsrc/index.ts\n</FileTree>\n");
  assert.equal(issues[0]?.code, "FILE_TREE");
});
