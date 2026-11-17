import { expect, test } from "@playwright/test";
import type { DocumentDiagnostics } from "../../src/protocol.ts";
import { runSnippet } from "./workspace.ts";

// The diagram reference's unit test compiles every form with a fake text measure. Only a
// browser measures real text, so this page draws each form and the browser checks it.
test("every diagram form draws in the browser without diagnostics", async ({ page }) => {
  await page.goto("/diagrams");
  const forms = [
    "request-sequence",
    "queue-sequence",
    "tables",
    "tcp-header",
    "hash-table",
    "marked-request",
    "token-flow",
    "worker-states",
  ];
  for (const id of forms)
    await expect(page.locator(`figure#${id} svg [data-element-id]`).first()).toBeVisible();
  await expect(page.getByRole("list", { name: "Diagram diagnostics" })).toHaveCount(0);

  // diagnostics() waits until the open browser has reported its checks of the page.
  const checked = await runSnippet(
    'import { checkDocument } from "yapparatus/agent"; console.log(JSON.stringify(await checkDocument()));',
  );
  expect(checked.stderr).toBe("");
  const { diagnostics, unchecked } = JSON.parse(checked.stdout) as DocumentDiagnostics;
  expect(diagnostics.filter((d) => d.source === "content/diagrams.mdx")).toEqual([]);
  expect(unchecked.map((page) => page.address)).not.toContain("/diagrams");
});
