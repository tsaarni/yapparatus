/** Diagrams: every form draws, the server checks unopened pages, and broken replies are refused. */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  agentHeader,
  type DocumentDiagnostics,
  type ReplyRefusal,
} from "../../src/protocol/rest-api.ts";
import { root, runCommand } from "./workspace.ts";

/** The document's diagnostics once recent edits are checked, as the agent reads them. */
async function checkDocument(): Promise<DocumentDiagnostics> {
  const checked = await runCommand(
    'import { checkDocument } from "yapparatus/agent"; console.log(JSON.stringify(await checkDocument()));',
  );
  expect(checked.stderr).toBe("");
  return JSON.parse(checked.stdout) as DocumentDiagnostics;
}

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
    "frame-steps",
    "worker-states",
    "report-flow",
    "service-grid",
    "team-tree",
  ];
  for (const id of forms)
    await expect(page.locator(`figure#${id} svg [data-element-id]`).first()).toBeVisible();
  const outlines = {
    "upload-orders": "polygon",
    "order-events": "ellipse",
    "daily-reports": "path",
  };
  for (const [id, outline] of Object.entries(outlines))
    await expect(
      page.locator(`figure#report-flow [data-element-id="${id}"] ${outline}`).first(),
    ).toBeVisible();
  const stacks = { "billing-workers": ["rect", 6], "daily-reports": ["path", 4] } as const;
  for (const [id, [outline, count]] of Object.entries(stacks))
    await expect(
      page.locator(`figure#report-flow [data-element-id="${id}"] > ${outline}`),
    ).toHaveCount(count);
  await expect(
    page.locator(
      'figure#service-grid [data-element-id="auth-service-that-checks-every-token-against-the-session-store"] > text',
    ),
  ).toHaveCount(2);
  await expect(page.locator('figure#team-tree [data-element-id*="->"]')).toHaveCount(7);
  const heads = (id: string) =>
    page.locator(`figure#request-sequence [data-element-id="${id}"] :is(polygon, polyline)`);
  await expect(heads("get-item")).toHaveCount(1);
  await expect(heads("get-item").first()).toHaveJSProperty("tagName", "polygon");
  await expect(heads("rows")).toHaveCount(1);
  await expect(heads("rows").first()).toHaveJSProperty("tagName", "polyline");
  await expect(
    page.locator('figure#team-tree [data-element-id*="->"] :is(polygon, polyline)'),
  ).toHaveCount(0);
  await expect(page.getByRole("list", { name: "Diagram diagnostics" })).toHaveCount(0);
});

test("frames keep their look without a role; step-only frames and enclosures show in steps", async ({
  page,
}) => {
  await page.goto("/diagrams");
  const flow = page.locator("figure#token-flow");
  const box = flow.locator('[data-element-id="check-token"] rect').first();
  const style = (locator: typeof box, property: "stroke" | "fill") =>
    locator.evaluate((e, p) => getComputedStyle(e)[p], property);
  for (const [figure, id] of [
    ["token-flow", "opt-token-present"],
    ["queue-sequence", "drain"],
  ]) {
    const outline = page.locator(`figure#${figure} [data-element-id="${id}"] > rect`);
    await expect(outline).toHaveCSS("stroke-width", "1px");
    await expect(outline).toHaveCSS("stroke", await style(box, "stroke"));
    await expect(outline).toHaveCSS("fill", "none");
  }
  const tab = flow.locator("svg[data-diagram] > g:last-child > path");
  await expect(tab).toHaveCSS("fill", await style(box, "fill"));
  await expect(tab).toHaveCSS("stroke", await style(box, "stroke"));
  await expect(tab).toHaveCSS("stroke-width", "1px");

  const figure = page.locator("figure#frame-steps");
  const element = (id: string) => figure.locator(`[data-element-id="${id}"]`);
  await expect(element("client->zone")).toBeVisible();
  await expect(figure.getByRole("button", { name: "Private" })).toBeVisible();
  await expect(element("api-callout")).toHaveCSS("opacity", "0");
  await expect(element("store")).toHaveCSS("opacity", "0");
  await figure.getByRole("button", { name: "Start steps" }).click();
  await expect(element("api-callout")).toHaveCSS("opacity", "1");
  await expect(element("store")).toHaveCSS("opacity", "0");
  await figure.getByRole("button", { name: "Next step" }).click();
  await expect(element("api-callout")).toHaveCSS("opacity", "0");
  await expect(element("store")).toHaveCSS("opacity", "1");
  await figure.getByRole("button", { name: "Show all" }).click();
  await page.emulateMedia({ media: "print" });
  await expect(element("store")).toHaveCSS("opacity", "0");
  await expect(element("api-callout")).toHaveCSS("opacity", "0");
  await expect(element("zone")).toHaveCSS("opacity", "1");
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
      ["UNKNOWN_ELEMENT", "error", "delta"],
    ]);
    expect(prompt).toContain(
      `- error UNKNOWN_ELEMENT content/second-page.mdx:${start}-${end}, /second-page#broken-flow: Step 1 focuses "delta"`,
    );
    expect(prompt).toContain(
      `- warning NODE_OVERLAP content/second-page.mdx:${start}-${end}, /second-page#broken-flow, elements alpha, gamma:`,
    );

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

    writeFileSync(file, `${original.trimEnd()}\n\n${broken}`);
    await page.goto("/second-page#broken-flow");
    const list = page.getByRole("list", { name: "Diagram diagnostics" });
    await expect(list).toContainText("UNKNOWN_ELEMENT");
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
    data: { author: "reader", text: "Draw it.", references: [] },
  });
  expect(created.status()).toBe(201);
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
  expect(error).toMatch(/^- error PLACEMENT_CYCLE line 3, elements alpha: /m);

  const sent = await send(`A drawing:

<Diagram draw={(d) => {
  const a = d.box("Alpha")
  d.place(d.box("Beta"), { at: a.center })
  d.place(a, { at: [0, 0] })
}} />
`);
  expect(sent.status()).toBe(204);
});
