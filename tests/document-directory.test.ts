import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { documentError } from "../src/document-directory.ts";

/** A project with a document.json in each of `documents`. */
function project(documents: string[]): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "yapparatus-documents-"));
  for (const document of documents) {
    mkdirSync(path.join(root, document), { recursive: true });
    writeFileSync(path.join(root, document, "document.json"), "{}");
  }
  return root;
}

test("a directory with a document.json is a document directory", () => {
  const root = project(["content", "docs/design"]);
  try {
    assert.equal(documentError(root, "content"), undefined);
    assert.equal(documentError(root, "docs/design"), undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a directory without a document.json is refused", () => {
  const root = project([]);
  try {
    assert.equal(
      documentError(root, "docs"),
      "docs is not a document directory: it has no document.json.",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a document directory cannot contain another one", () => {
  const root = project(["docs", "docs/design"]);
  try {
    assert.equal(documentError(root, "docs"), "docs contains the document directory docs/design.");
    assert.equal(
      documentError(root, "docs/design"),
      "docs/design is inside the document directory docs.",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
