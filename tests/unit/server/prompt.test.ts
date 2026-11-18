/** The agent's prompt text for references and for the folders a document shows. */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { ExternalFiles } from "../../../src/compiler/external-files.ts";
import { acceptReferences } from "../../../src/server/chat-log.ts";
import { messagesPrompt, startPrompt } from "../../../src/server/prompt.ts";
import { paragraph } from "./workspace.ts";

test("the prompt names each reference by kind, lines, address, and words", () => {
  const message = {
    seq: 4,
    author: "reader" as const,
    text: "Why?",
    createdAt: "",
    references: [
      { ...paragraph, kind: "text" as const, address: "/page#first:~:text=Original%20paragraph" },
      {
        ...paragraph,
        kind: "section" as const,
        address: "/page#first",
        startLine: 3,
        endLine: 10,
      },
      { ...paragraph, kind: "page" as const, address: "/page" },
      {
        ...paragraph,
        kind: "diagram-element" as const,
        address: "/page#flow--api",
        step: "Step 2 of 3 (api): calls",
      },
    ],
  };
  const text = messagesPrompt([message], "Diagnostics: none", "guide.md");
  assert.match(text, /- text, content\/page\.mdx:5, \/page#first: “Original paragraph”/);
  assert.match(text, /- section, content\/page\.mdx:3-10, \/page#first\n/);
  assert.match(text, /- page, content\/page\.mdx, \/page\n/);
  assert.match(
    text,
    /- diagram element, content\/page\.mdx:5, \/page#flow--api, open at Step 2 of 3 \(api\): calls/,
  );
});

test("two folders with the same paths stay apart, in references and in the agent's prompt", () => {
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
    const files = new ExternalFiles(() => root, "guide");
    const item = (folder: string) => {
      const read = files.read({ folder, path: "src/main.ts" });
      assert.ok(!("error" in read));
      return {
        kind: "lines",
        address: `/-/files/${folder}/src/main.ts#L2:~:text=name`,
        source: read.source,
        startLine: 2,
        endLine: 2,
      };
    };
    const references = acceptReferences(root, "guide", files, [item("app"), item("lib")]);
    assert.deepEqual(
      references.map((c) => c.source),
      ["app/src/main.ts", "lib/src/main.ts"],
    );
    assert.throws(
      () => acceptReferences(root, "guide", files, [{ ...item("app"), source: "lib/src/main.ts" }]),
      /file the document shows/,
    );
    const message = {
      seq: 1,
      author: "reader" as const,
      text: "How do these differ?",
      references,
      createdAt: new Date().toISOString(),
    };
    const prompt = messagesPrompt([message], "Diagnostics: none", "guide.md");
    assert.match(
      prompt,
      /- file text, app\/src\/main\.ts:2, \/-\/files\/app\/src\/main\.ts#L2: “name”/,
    );
    assert.match(
      prompt,
      /- file text, lib\/src\/main\.ts:2, \/-\/files\/lib\/src\/main\.ts#L2: “name”/,
    );
    const start = startPrompt("/project/docs/guide.md", { app: "app", lib: "lib" }, "/project");
    assert.match(start, /- app: app\n- lib: lib/);
    assert.match(start, /Run this from the project directory, \/project,/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
