/**
 * The diagnostic store: an error keeps its identity when its message is reworded, checks of the
 * sources run one at a time, and a new page waits for the watcher.
 */

import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { ViteDevServer } from "vite";
import type { ExternalFiles } from "../../../src/compiler/external-files.ts";
import { DiagnosticStore, diagnosticKey } from "../../../src/server/diagnostic-store.ts";

test("an error is identified by its subject, so rewording does not make it new", () => {
  const link = { origin: "link" as const, code: "BROKEN_LINK" as const };
  const a = { ...link, source: "content/a.mdx", subject: "nowhere", message: "No page." };
  assert.equal(diagnosticKey(a), diagnosticKey({ ...a, message: "No page matches." }));
  assert.notEqual(diagnosticKey(a), diagnosticKey({ ...a, subject: "elsewhere" }));
  const runtime = { origin: "runtime" as const, code: "RUNTIME_FAILED" as const };
  assert.notEqual(
    diagnosticKey({ ...runtime, message: "x" }),
    diagnosticKey({ ...runtime, message: "y" }),
  );
});

test("a check asked for while one runs joins it, and the store settles only after both", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "yapparatus-store-"));
  try {
    mkdirSync(path.join(root, "content"));
    writeFileSync(path.join(root, "content/document.json"), '{ "pages": [] }');
    const store = new DiagnosticStore({
      root,
      content: "content",
      server: {} as ViteDevServer,
      files: {} as ExternalFiles,
      replies: () => new Set(),
      changed: () => {},
    });
    const first = store.checkSources();
    const second = store.checkSources();
    assert.equal(second, first);
    assert.equal(store.settled(), false);
    await second;
    assert.equal(store.settled(), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a page that Vite cannot load until the watcher reports it compiles once it does", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "yapparatus-store-"));
  try {
    mkdirSync(path.join(root, "content"));
    writeFileSync(path.join(root, "content/document.json"), '{ "pages": ["new.mdx"] }');
    writeFileSync(path.join(root, "content/new.mdx"), "# New\n");
    const watcher = new EventEmitter();
    let reported = false;
    const server = {
      watcher,
      environments: {
        ssr: {
          moduleGraph: { getModuleById: () => undefined },
          transformRequest: async (url: string) => {
            if (!reported) throw new Error(`Failed to load url ${url}. Does the file exist?`);
            return {};
          },
        },
      },
    } as unknown as ViteDevServer;
    const store = new DiagnosticStore({
      root,
      content: "content",
      server,
      files: {} as ExternalFiles,
      replies: () => new Set(),
      changed: () => {},
    });
    setTimeout(() => {
      reported = true;
      watcher.emit("add", path.join(root, "content/new.mdx"));
    }, 100);
    await store.checkSources();
    assert.deepEqual(
      store.list().map((d) => d.code),
      [],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
