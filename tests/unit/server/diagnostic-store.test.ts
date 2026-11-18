/** The diagnostic store: an error keeps its identity when its message is reworded. */

import assert from "node:assert/strict";
import { test } from "node:test";
import { diagnosticKey } from "../../../src/server/diagnostic-store.ts";

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
