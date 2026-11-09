import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  checkLinks,
  checkPages,
  checkTheme,
  type PageOutline,
  quoteOf,
  resolveLink,
  splitAddress,
  textFragment,
} from "../src/document.ts";
import { errorKey } from "../src/server/agent.ts";
import { acceptContext, placeContext, sectionEnd } from "../src/server/chat.ts";
import { messagesPrompt, type Placement } from "../src/server/prompt.ts";
import { Sequence } from "../src/server/sequence.ts";
import { SourceFiles } from "../src/source-files.ts";
import { blockHash } from "../src/source-plugin.ts";

const page =
  "# Page\n\n## First\n\nOriginal paragraph.\n\n```md\n## not a heading\n```\n\n## Second\n\nMore.\n";
const lines = page.split("\n");

function withWorkspace(run: (root: string) => void) {
  const root = mkdtempSync(path.join(os.tmpdir(), "yapparatus-context-"));
  try {
    mkdirSync(path.join(root, "content"));
    writeFileSync(path.join(root, "content/page.mdx"), page);
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const paragraph = {
  kind: "text",
  address: "/page#first:~:text=paragraph",
  source: "content/page.mdx",
  hash: blockHash(lines, 5, 5),
  startLine: 5,
  endLine: 5,
};

test("context is kept as sent; its lines are found again by hash when the prompt is written", () => {
  withWorkspace((root) => {
    const file = path.join(root, "content/page.mdx");
    const [item] = acceptContext(root, "content", new SourceFiles(() => root, "content"), [
      { ...paragraph, snapshot: "dropped" },
    ]);
    assert.ok(item);
    assert.deepEqual(Object.keys(item).sort(), [
      "address",
      "endLine",
      "hash",
      "kind",
      "source",
      "startLine",
    ]);
    assert.deepEqual(placeContext(root, item), { start: 5, end: 5 });
    // Lines added above move the block; the hash finds it.
    writeFileSync(file, page.replace("## First\n", "## First\n\nNew.\n"));
    assert.deepEqual(placeContext(root, item), { start: 7, end: 7 });
    // An edit to the block itself is reported, not guessed.
    writeFileSync(file, page.replace("Original", "Changed"));
    assert.equal(placeContext(root, item), "changed");
  });
});

test("a section is placed from its heading to the next heading, ignoring headings inside code", () => {
  assert.equal(sectionEnd(lines, 3), 10);
  withWorkspace((root) => {
    const [section] = acceptContext(root, "content", new SourceFiles(() => root, "content"), [
      {
        ...paragraph,
        kind: "section",
        address: "/page#first",
        startLine: 3,
        endLine: 3,
        hash: blockHash(lines, 3, 3),
      },
    ]);
    assert.ok(section);
    assert.deepEqual(placeContext(root, section), { start: 3, end: 10 });
  });
});

test("the prompt names each item by kind, current lines, address, and words", () => {
  const message = {
    seq: 4,
    author: "reader" as const,
    text: "Why?",
    createdAt: "",
    context: [
      { ...paragraph, kind: "text" as const, address: "/page#first:~:text=Original%20paragraph" },
      { ...paragraph, kind: "page" as const, address: "/page" },
      {
        ...paragraph,
        kind: "diagram-part" as const,
        address: "/page#flow--api",
        step: "Step 2 of 3 (api): calls",
      },
    ],
  };
  const places: Placement[] = [{ start: 7, end: 7 }, undefined, "changed"];
  let i = 0;
  const text = messagesPrompt([message], () => places[i++], "Diagnostics: none", "guide.md", 4);
  assert.match(text, /- text, content\/page\.mdx:7, \/page#first: “Original paragraph”/);
  assert.match(text, /- page, content\/page\.mdx, \/page\n/);
  assert.match(
    text,
    /- diagram part, content\/page\.mdx, changed since asked \(was 5-5\), \/page#flow--api, open at Step 2 of 3 \(api\): calls/,
  );
});

test("rejects unknown kinds and files outside the document", () => {
  withWorkspace((root) => {
    assert.throws(
      () =>
        acceptContext(root, "content", new SourceFiles(() => root, "content"), [
          { ...paragraph, kind: "x" },
        ]),
      /Invalid/,
    );
    writeFileSync(path.join(root, "outside.mdx"), "Private\n");
    symlinkSync(path.join(root, "outside.mdx"), path.join(root, "content/escape.mdx"));
    assert.throws(
      () =>
        acceptContext(root, "content", new SourceFiles(() => root, "content"), [
          { ...paragraph, source: "content/escape.mdx" },
        ]),
      /document page/,
    );
  });
});

test("addresses carry selected words as a text fragment", () => {
  const address = `/page#first${textFragment("one two three four five six seven eight nine")}`;
  assert.deepEqual(splitAddress(address), {
    page: "page",
    anchor: "first",
    text: { start: "one two three four", end: "six seven eight nine" },
  });
  assert.equal(quoteOf(address), "one two three four … six seven eight nine");
  assert.equal(quoteOf("/page#:~:text=a%2Db%2C%20c"), "a-b, c");
  assert.equal(quoteOf("/page#first"), undefined);
});

const outline = (overrides: Partial<PageOutline>): PageOutline => ({
  revision: "r",
  title: "Page",
  headings: [],
  numbered: [],
  anchors: [],
  links: [],
  refs: [],
  ...overrides,
});

test("links resolve by address, file name, and anchor; broken ones are reported", () => {
  const ids = ["intro", "setup"];
  assert.deepEqual(resolveLink("setup#install", "intro", ids), {
    page: "setup",
    fragment: "install",
  });
  assert.deepEqual(resolveLink("./setup.mdx", "intro", ids), {
    page: "setup",
    fragment: "",
  });
  assert.equal(resolveLink("https://example.org", "intro", ids), "external");
  assert.equal(resolveLink("nowhere", "intro", ids), undefined);

  const problems = checkLinks(
    [
      {
        id: "intro",
        outline: outline({
          anchors: ["overview", "flow"],
          numbered: [{ kind: "figure", id: "flow", caption: "Flow." }],
          links: [
            { href: "setup#install", line: 3 },
            { href: "setup#missing", line: 4 },
            { href: "nowhere", line: 5 },
            { href: "#flow--api", line: 6 },
          ],
          refs: [
            { to: "flow", line: 7 },
            { to: "routes", line: 8 },
            { to: "/setup#install", line: 9 },
            { to: "/setup", line: 10 },
            { to: "/setup#routes--api", line: 11 },
            { to: "/nowhere", line: 12 },
            { to: "/setup#missing", line: 13 },
            { to: "setup#install", line: 14 },
          ],
        }),
      },
      {
        id: "setup",
        outline: outline({
          anchors: ["install", "routes"],
          numbered: [{ kind: "table", id: "routes", caption: "Routes." }],
        }),
      },
    ],
    () => ({ error: "no files" }),
  );
  assert.deepEqual(
    problems.map((p) => `${p.code}:${p.line}`),
    ["BROKEN_LINK:4", "BROKEN_LINK:5", "BROKEN_REF:12", "BROKEN_REF:13", "BROKEN_REF:14"],
  );
});

test("page files are listed once in document.json and named as their addresses", () => {
  assert.deepEqual(checkPages(["intro", "guide/setup"], ["intro.mdx", "guide/setup.mdx"]), []);
  assert.deepEqual(checkPages(["intro"], undefined), [
    'document.json must list the page files in reading order: { "pages": ["overview.mdx", …] }.',
  ]);
  assert.deepEqual(checkPages(["intro"], ["intro"]), [
    '"pages" in document.json lists "intro"; name the file: "intro.mdx".',
    '"intro.mdx" is missing from "pages" in document.json.',
  ]);
  assert.deepEqual(
    checkPages(["intro", "02-Setup", "api"], ["intro.mdx", "intro.mdx", "gone.mdx"]),
    [
      '"02-Setup.mdx" is not a page name: use lowercase letters, digits, and hyphens.',
      '"02-Setup.mdx" is missing from "pages" in document.json.',
      '"api.mdx" is missing from "pages" in document.json.',
      '"intro.mdx" is listed twice in "pages" in document.json.',
      '"pages" in document.json lists "gone.mdx", which does not exist.',
    ],
  );
});

test("the sequence survives a restart and never goes below the log", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "yapparatus-sequence-"));
  try {
    const file = path.join(dir, "sequence");
    const first = new Sequence(file);
    first.raiseTo(4);
    assert.equal(first.next(), 5);
    assert.equal(first.next(), 6);
    // Numbers taken by errors, which are not in the log, are not used again.
    const restarted = new Sequence(file);
    restarted.raiseTo(5);
    assert.equal(restarted.next(), 7);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an error is identified by its subject, so rewording does not make it new", () => {
  const link = { origin: "link" as const, code: "BROKEN_LINK" as const };
  const a = { ...link, source: "content/a.mdx", subject: "nowhere", message: "No page." };
  assert.equal(errorKey(a), errorKey({ ...a, message: "No page matches." }));
  assert.notEqual(errorKey(a), errorKey({ ...a, subject: "elsewhere" }));
  // Without a subject, the message identifies it.
  const runtime = { origin: "runtime" as const, code: "RUNTIME_FAILED" as const };
  assert.notEqual(errorKey({ ...runtime, message: "x" }), errorKey({ ...runtime, message: "y" }));
});

test("checkTheme accepts the three settings and no setting, and explains anything else", () => {
  for (const theme of [undefined, "dark", "light", "auto"]) assert.deepEqual(checkTheme(theme), []);
  assert.deepEqual(checkTheme("system"), [
    '"theme" in document.json is "system"; use "dark", "light", or "auto".',
  ]);
});
