import assert from "node:assert/strict";
import { symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { ExternalFiles } from "../../../src/compiler/external-files.ts";
import { acceptReferences } from "../../../src/server/chat-log.ts";
import { withProject } from "../project.ts";
import { paragraph, withWorkspace } from "./workspace.ts";

test("references are kept as sent, with the lines the reader saw", () => {
  withWorkspace((root) => {
    const [item] = acceptReferences(root, "content", new ExternalFiles(() => root, "content"), [
      { ...paragraph, snapshot: "dropped" },
    ]);
    assert.ok(item);
    assert.deepEqual(Object.keys(item).sort(), [
      "address",
      "endLine",
      "kind",
      "source",
      "startLine",
    ]);
    assert.deepEqual([item.startLine, item.endLine], [5, 5]);
  });
});

test("rejects unknown kinds and files outside the document", () => {
  withWorkspace((root) => {
    assert.throws(
      () =>
        acceptReferences(root, "content", new ExternalFiles(() => root, "content"), [
          { ...paragraph, kind: "x" },
        ]),
      /Invalid/,
    );
    writeFileSync(path.join(root, "outside.mdx"), "Private\n");
    symlinkSync(path.join(root, "outside.mdx"), path.join(root, "content/escape.mdx"));
    assert.throws(
      () =>
        acceptReferences(root, "content", new ExternalFiles(() => root, "content"), [
          { ...paragraph, source: "content/escape.mdx" },
        ]),
      /document page/,
    );
  });
});

test("lines of a source file are references", () =>
  withProject((root, files) => {
    const item = {
      kind: "lines",
      address: "/-/files/app/src/main.ts#L2-L3",
      source: "app/src/main.ts",
      startLine: 2,
      endLine: 3,
    };
    const [accepted] = acceptReferences(root, "content", files, [item]);
    assert.deepEqual(accepted, item);
    // The address, the source, and the lines must agree.
    assert.throws(
      () => acceptReferences(root, "content", files, [{ ...item, source: "secret.txt" }]),
      /file the document shows/,
    );
    assert.throws(
      () => acceptReferences(root, "content", files, [{ ...item, startLine: 1 }]),
      /Invalid/,
    );
    assert.throws(
      () => acceptReferences(root, "content", files, [{ ...item, kind: "file" }]),
      /Invalid/,
    );
  }));
