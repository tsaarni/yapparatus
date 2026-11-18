import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { agentHeader, type DocumentDiagnostics, type ReplyRefusal } from "../../src/protocol.ts";
import { root, runSnippet } from "./workspace.ts";

/** The document's diagnostics once recent edits are checked, as the agent reads them. */
async function checkDocument(): Promise<DocumentDiagnostics> {
  const checked = await runSnippet(
    'import { checkDocument } from "yapparatus/agent"; console.log(JSON.stringify(await checkDocument()));',
  );
  expect(checked.stderr).toBe("");
  return JSON.parse(checked.stdout) as DocumentDiagnostics;
}

// The diagram reference's unit test compiles every form with a fake text measure. The page
// compiler measures with the reader's font files, and the browser draws what it compiled.
test("every diagram form compiles without diagnostics and draws in the browser", async ({
  page,
}) => {
  const { diagnostics } = await checkDocument();
  expect(diagnostics.filter((d) => d.source === "content/diagrams.mdx")).toEqual([]);
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
});

test("the server checks a diagram on a page no browser has open", async ({ page }) => {
  const file = path.join(root, "content/second-page.mdx");
  const original = readFileSync(file, "utf8");
  const broken = `<Diagram id="broken-flow" caption="A broken flow." draw={(d) => {
  const a = d.box("Alpha")
  d.row([a, d.box("Beta →")])
  d.place(d.box("Gamma"), { at: a.center })
}}>
  <Step focus="alpha delta">A step.</Step>
</Diagram>
`;
  writeFileSync(file, `${original.trimEnd()}\n\n${broken}`);
  try {
    const lines = readFileSync(file, "utf8").split("\n");
    const start = lines.findIndex((line) => line.includes('id="broken-flow"')) + 1;
    const end = lines.length - 1;
    const { diagnostics, prompt } = await checkDocument();
    const found = diagnostics.filter((d) => d.target === "broken-flow");
    expect(found.map((d) => [d.code, d.severity, d.subject]).sort()).toEqual([
      ["FONT_FALLBACK", "warning", "→"],
      ["NODE_OVERLAP", "warning", "alpha,gamma"],
      ["UNKNOWN_PART", "error", "delta"],
    ]);
    expect(prompt).toContain(
      `- error UNKNOWN_PART content/second-page.mdx:${start}-${end}, /second-page#broken-flow: Step 1 focuses "delta"`,
    );
    expect(prompt).toContain(
      `- warning NODE_OVERLAP content/second-page.mdx:${start}-${end}, /second-page#broken-flow, parts alpha, gamma:`,
    );

    // A draw program uses only its own values; an outside name is named, at its line.
    writeFileSync(
      file,
      `${original.trimEnd()}\n\nexport const label = "Alpha"\n\n<Diagram id="broken-flow" draw={(d) => {\n  d.box(label)\n}} />\n`,
    );
    const outside = readFileSync(file, "utf8").split("\n");
    const at = outside.indexOf("  d.box(label)") + 1;
    const second = await checkDocument();
    expect(second.prompt).toContain(
      `- error DRAW_FAILED content/second-page.mdx:${at}, /second-page#broken-flow: draw uses label, which it does not define.`,
    );

    // The browser draws what the server compiled: the figure lists the same diagnostics.
    writeFileSync(file, `${original.trimEnd()}\n\n${broken}`);
    await page.goto("/second-page#broken-flow");
    const list = page.getByRole("list", { name: "Diagram diagnostics" });
    await expect(list).toContainText("UNKNOWN_PART");
    await expect(list).toContainText("NODE_OVERLAP");
    await expect(page.locator("figure#broken-flow svg [data-element-id='alpha']")).toBeVisible();
  } finally {
    writeFileSync(file, original);
  }
  const fixed = await checkDocument();
  expect(fixed.diagnostics.filter((d) => d.target === "broken-flow")).toEqual([]);
});

test("a reply with a broken diagram is refused; one with only warnings is not", async ({
  request,
}) => {
  const created = await request.post("/-/api/chat", {
    data: { author: "reader", text: "Draw it.", context: [] },
  });
  expect(created.status()).toBe(201);
  // A reply answers the message an agent read, so read it as one, as the agent library does.
  const read = await request.get("/-/api/chat?author=reader", {
    headers: { [agentHeader]: "diagrams" },
  });
  expect(read.status()).toBe(200);
  const send = (mdx: string) => request.post("/-/api/chat", { data: { author: "agent", mdx } });

  const refused = await send(`A drawing:

<Diagram id="reply-flow" draw={(d) => {
  const a = d.box("Alpha")
  d.place(a, { below: a })
}}>
  <Step focus={"alpha"}>Computed.</Step>
</Diagram>
`);
  expect(refused.status()).toBe(422);
  const { error, diagnostics } = (await refused.json()) as ReplyRefusal;
  expect(diagnostics.map((d) => d.code).sort()).toEqual(["PLACEMENT_CYCLE", "STEP_NOT_TEXT"]);
  expect(error).toMatch(/^- error STEP_NOT_TEXT line 7: Step 1 has focus=\{…\}/m);
  expect(error).toMatch(/^- error PLACEMENT_CYCLE line 3, parts alpha: /m);

  // An overlap is a warning: the reply is stored.
  const sent = await send(`A drawing:

<Diagram draw={(d) => {
  const a = d.box("Alpha")
  d.place(d.box("Beta"), { at: a.center })
  d.place(a, { at: [0, 0] })
}} />
`);
  expect(sent.status()).toBe(204);
});
