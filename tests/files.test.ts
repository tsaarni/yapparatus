import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { compile, run } from "@mdx-js/mdx";
import { createElement, type ReactNode } from "react";
import * as runtime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { codeHighlighting, excerptRange, excerpts, languageOf } from "../src/code-plugin.ts";
import { checkLinks, type PageOutline, quoteOf, resolveLink } from "../src/document.ts";
import { checkFiles, fileAddress, fileSource, parseFileAddress, parseLines } from "../src/files.ts";
import { contentIssues } from "../src/markdown-plugin.ts";
import { acceptContext, placeContext } from "../src/server/chat.ts";
import { messagesPrompt, startPrompt } from "../src/server/prompt.ts";
import { SourceFiles } from "../src/source-files.ts";
import { blockHash } from "../src/source-plugin.ts";

const main = [
  "export function greet(name: string) {",
  // biome-ignore lint/suspicious/noTemplateCurlyInString: The line is TypeScript source text.
  "  const text = `Hello, ${name}`; // [!code highlight]",
  "  return text;",
  "}",
  "",
].join("\n");

/** The page component, reduced to its code: these tests look at the compiled lines. */
const Excerpt = ({ children }: { children?: ReactNode }) => children ?? null;

/** A project with a document in content/ that shows the folder app/. */
function withProject(run: (root: string, files: SourceFiles) => void | Promise<void>) {
  const root = mkdtempSync(path.join(os.tmpdir(), "yapparatus-files-"));
  const done = () => rmSync(root, { recursive: true, force: true });
  mkdirSync(path.join(root, "content"));
  mkdirSync(path.join(root, "app/src"), { recursive: true });
  mkdirSync(path.join(root, "app/.git"));
  writeFileSync(
    path.join(root, "content/document.json"),
    JSON.stringify({ pages: [], files: { app: "../app" } }),
  );
  writeFileSync(path.join(root, "app/src/main.ts"), main);
  writeFileSync(path.join(root, "app/.git/config"), "[core]\n");
  writeFileSync(path.join(root, "secret.txt"), "private\n");
  const result = run(root, new SourceFiles(() => root, "content"));
  if (result instanceof Promise) return result.finally(done);
  done();
}

test("file addresses name a folder, a path inside it, and maybe lines", () => {
  assert.deepEqual(parseFileAddress("/-/files/app/src/main.ts#L2-L3"), {
    folder: "app",
    path: "src/main.ts",
    lines: { start: 2, end: 3 },
  });
  assert.deepEqual(parseFileAddress("/-/files/app/src/main.ts#L2"), {
    folder: "app",
    path: "src/main.ts",
    lines: { start: 2, end: 2 },
  });
  assert.deepEqual(parseFileAddress("/-/files/app/README.md"), {
    folder: "app",
    path: "README.md",
  });
  for (const wrong of [
    "/-/files/app",
    "/-/files/app/../secret.txt",
    "/-/files/App/x.ts",
    "/-/files/app/x.ts#L3-L2",
    "/-/files/app/x.ts#intro",
    "/files/app/x.ts",
  ])
    assert.equal(parseFileAddress(wrong), undefined, wrong);
  assert.deepEqual(parseFileAddress("/-/files/app/x.ts#L2:~:text=retry"), {
    folder: "app",
    path: "x.ts",
    lines: { start: 2, end: 2 },
  });
  assert.equal(quoteOf("/-/files/app/x.ts#L2:~:text=retry"), "retry");
  assert.equal(parseLines("L0"), undefined);
  assert.equal(
    fileAddress({ folder: "app", path: "x.ts", lines: { start: 4, end: 4 } }),
    "/-/files/app/x.ts#L4",
  );
  assert.deepEqual(resolveLink("/-/files/app/x.ts#L4", "intro", ["intro"]), {
    file: { folder: "app", path: "x.ts", lines: { start: 4, end: 4 } },
  });
  assert.equal(resolveLink("/-/elsewhere", "intro", ["intro"]), undefined);
});

test("a file's place is relative to the project folder, even outside it", () => {
  const file = { folder: "app", path: "src/x.go" };
  assert.equal(fileSource("guide", { app: "../../app" }, file), "../app/src/x.go");
  assert.equal(fileSource("docs/design", { app: "../.." }, file), "src/x.go");
  assert.equal(fileSource("docs", { other: ".." }, file), undefined);
  assert.deepEqual(checkFiles({ app: "../app" }), []);
  assert.deepEqual(checkFiles(["../app"]), [
    '"files" in document.json names external directories by name: { "files": { "app": "../app" } }.',
  ]);
  assert.deepEqual(checkFiles({ App: "", ok: "." }), [
    '"files" in document.json names "App": use lowercase letters, digits, and hyphens.',
    '"files" in document.json gives "App" no directory path.',
  ]);
  assert.equal(languageOf("src/main.go"), "go");
  assert.equal(languageOf("Dockerfile"), "docker");
  assert.equal(languageOf("notes.unknown"), "text");
});

test("only files inside a named external directory are read", () =>
  withProject((root, files) => {
    const read = files.read({ folder: "app", path: "src/main.ts" });
    assert.ok(!("error" in read));
    assert.equal(read.source, "app/src/main.ts");
    assert.equal(read.lines.length, 4);
    symlinkSync(path.join(root, "secret.txt"), path.join(root, "app/escape.txt"));
    const refused = (file: string, folder = "app") => {
      const result = files.read({ folder, path: file });
      return "error" in result ? result.error : "read";
    };
    assert.match(refused("escape.txt"), /outside the external directory/);
    assert.match(refused(".git/config"), /\.git/);
    assert.match(refused("missing.ts"), /no file/);
    assert.match(refused("src"), /not a file/);
    assert.match(refused("x.ts", "other"), /no external directory "other"/);
  }));

test("links to files and lines are checked against the file", () =>
  withProject((_root, files) => {
    const outline: PageOutline = {
      revision: "",
      title: "Intro",
      headings: [],
      numbered: [],
      anchors: [],
      refs: [],
      links: [
        { href: "/-/files/app/src/main.ts#L2-L3", line: 3 },
        { href: "/-/files/app/src/main.ts#L4-L9", line: 4 },
        { href: "/-/files/app/src/gone.ts", line: 5 },
        { href: "/-/files/app", line: 6 },
      ],
    };
    const problems = checkLinks([{ id: "intro", outline }], files.lineCount);
    assert.deepEqual(
      problems.map((p) => `${p.code}:${p.line}`),
      ["BROKEN_ANCHOR:4", "BROKEN_LINK:5", "BROKEN_LINK:6"],
    );
    assert.match(problems[0]?.message ?? "", /lines 4–9, but the file has 4 lines/);
    assert.match(problems[2]?.message ?? "", /not a file address/);
  }));

test("lines of a source file are context, found again by hash", () =>
  withProject((root, files) => {
    const lines = main.split("\n");
    const item = {
      kind: "lines",
      address: "/-/files/app/src/main.ts#L2-L3",
      source: "app/src/main.ts",
      startLine: 2,
      endLine: 3,
      hash: blockHash(lines, 2, 3),
    };
    const [accepted] = acceptContext(root, "content", files, [item]);
    assert.ok(accepted);
    assert.deepEqual(placeContext(root, accepted), { start: 2, end: 3 });
    writeFileSync(path.join(root, "app/src/main.ts"), `// A greeting.\n\n${main}`);
    assert.deepEqual(placeContext(root, accepted), { start: 4, end: 5 });
    // The address, the source, and the lines must agree.
    assert.throws(
      () => acceptContext(root, "content", files, [{ ...item, source: "secret.txt" }]),
      /file the document shows/,
    );
    assert.throws(
      () => acceptContext(root, "content", files, [{ ...item, startLine: 1 }]),
      /Invalid/,
    );
    assert.throws(
      () => acceptContext(root, "content", files, [{ ...item, kind: "file" }]),
      /Invalid/,
    );
  }));

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
      const { default: Content } = await run(js, { ...runtime, baseUrl: import.meta.url });
      return {
        html: renderToStaticMarkup(createElement(Content, { components: { Excerpt } })),
        issues: contentIssues.get(file) ?? [],
      };
    };
    const { html, issues } = await compileExcerpt(
      '<Excerpt from="/-/files/app/src/main.ts" start="const text" end="return" mark="return" />',
    );
    assert.deepEqual(issues, []);
    assert.match(html, /data-language="ts"/);
    assert.match(html, /data-line="2"/);
    assert.match(html, /data-line="3" data-mark="highlight"/);
    assert.doesNotMatch(html, /data-line="1"|data-line="4"/);
    // The file's own text is shown as written, notation included.
    assert.match(html, /\[!code highlight\]/);
    // Without end, the excerpt is the block its first line opens, closing brace included.
    const block = await compileExcerpt(
      '<Excerpt from="/-/files/app/src/main.ts" start="export function greet(" mark={["const", "return"]} />',
    );
    assert.deepEqual(block.issues, []);
    assert.match(block.html, /data-line="1"[^>]*>[\s\S]*data-line="4"/);
    assert.match(block.html, /data-line="2" data-mark="highlight"/);
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

test("two folders with the same paths stay apart, in context and in the agent's prompt", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "yapparatus-two-"));
  try {
    mkdirSync(path.join(root, "guide"));
    for (const project of ["app", "lib"]) {
      mkdirSync(path.join(root, project, "src"), { recursive: true });
      writeFileSync(
        path.join(root, project, "src/main.ts"),
        `// ${project}\nexport const name = "${project}";\n`,
      );
    }
    writeFileSync(
      path.join(root, "guide/document.json"),
      JSON.stringify({ pages: [], files: { app: "../app", lib: "../lib" } }),
    );
    const files = new SourceFiles(() => root, "guide");
    const item = (folder: string) => {
      const read = files.read({ folder, path: "src/main.ts" });
      assert.ok(!("error" in read));
      return {
        kind: "lines",
        address: `/-/files/${folder}/src/main.ts#L2:~:text=name`,
        source: read.source,
        startLine: 2,
        endLine: 2,
        hash: blockHash(read.lines, 2, 2),
      };
    };
    const context = acceptContext(root, "guide", files, [item("app"), item("lib")]);
    assert.deepEqual(
      context.map((c) => c.source),
      ["app/src/main.ts", "lib/src/main.ts"],
    );
    // An item cannot claim one folder's address with the other folder's file.
    assert.throws(
      () => acceptContext(root, "guide", files, [{ ...item("app"), source: "lib/src/main.ts" }]),
      /file the document shows/,
    );
    const message = {
      seq: 1,
      author: "reader" as const,
      text: "How do these differ?",
      context,
      createdAt: new Date().toISOString(),
    };
    const prompt = messagesPrompt(
      [message],
      (c) => placeContext(root, c),
      "Diagnostics: none",
      "guide.md",
      1,
    );
    assert.match(
      prompt,
      /- file text, app\/src\/main\.ts:2, \/-\/files\/app\/src\/main\.ts#L2: “name”/,
    );
    assert.match(
      prompt,
      /- file text, lib\/src\/main\.ts:2, \/-\/files\/lib\/src\/main\.ts#L2: “name”/,
    );
    // The start prompt names each folder and where it is, from the project folder.
    const start = startPrompt(0, "/project/docs/guide.md", { app: "app", lib: "lib" }, "/project");
    assert.match(start, /- app: app\n- lib: lib/);
    assert.match(start, /Run this from the project directory, \/project,/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
