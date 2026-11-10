import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, type Page, test } from "@playwright/test";
import type { ChatState, ContextItem } from "../../src/protocol.ts";
import { root, runSnippet, snippets } from "./workspace.ts";

const storedContext = () =>
  JSON.parse(sessionStorage.getItem("yapparatus:context") ?? "[]") as ContextItem[];

test("an excerpt links to its file, which opens at the lines and lists where pages discuss it", async ({
  page,
}) => {
  await page.goto("/source-code");
  const excerpt = page.locator("[data-file='/-/files/sample/greet.ts']");
  await expect(excerpt.locator("[data-line]")).toHaveCount(4);
  await expect(excerpt.locator("[data-line='2'][data-mark=highlight]")).toHaveCount(1);
  // Line numbers are drawn beside the code, outside its text.
  await expect(excerpt.locator("[data-line='1']")).toHaveText(
    "export function greet(name: string) {",
  );
  await expect(page.locator("figcaption", { hasText: "Listing 6.1" })).toBeVisible();

  await excerpt.getByRole("link", { name: "sample/greet.ts:1–4" }).click();
  await expect(page).toHaveURL(/\/-\/files\/sample\/greet\.ts$/);
  await expect(page.locator("main h1")).toContainText("greet.ts");
  await expect(page.getByRole("navigation", { name: "Discussed in" })).toContainText(
    "Source code › The greeting",
  );
  await expect(page.locator("[data-selected]")).toHaveCount(0);

  // A link in prose opens the file at its lines.
  await page.goto("/source-code");
  await page.getByRole("link", { name: "greeting", exact: true }).click();
  await expect(page).toHaveURL(/\/-\/files\/sample\/greet\.ts#L2-L3$/);
  await expect(page.locator("[data-selected]")).toHaveCount(2);
});

test("asking about lines of a file gives the agent the file and its lines", async ({
  page,
  request,
}) => {
  await page.goto("/-/files/sample/greet.ts");
  const code = page.locator("main article [data-file]");
  await expect(code.locator("[data-line]")).toHaveCount(4);
  await code.evaluate((region) => {
    const range = document.createRange();
    const last = region.querySelector("[data-line='3']") as Node;
    range.setStart(region.querySelector("[data-line='2']") as Node, 0);
    range.setEnd(last, last.childNodes.length);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
  });
  await page
    .getByRole("toolbar", { name: "Selection actions" })
    .getByRole("button", { name: "Ask", exact: true })
    .click();
  await expect(page.locator(".context-items")).toContainText("greet.ts, lines 2–3");
  const [lines] = await page.evaluate(storedContext);
  expect(lines).toMatchObject({
    kind: "lines",
    address: "/-/files/sample/greet.ts#L2-L3",
    source: "source/greet.ts",
    startLine: 2,
    endLine: 3,
  });

  // The title stands for the whole file.
  await page.getByRole("button", { name: "Ask about greet.ts" }).click();
  await expect(page.locator(".context-items")).toContainText(/greet\.ts$/m);

  const created = await request.post("/-/api/chat/reader", {
    data: { text: "Why a template string?", context: [lines] },
  });
  expect(created.status()).toBe(201);
  const { seq } = (await created.json()) as { seq: number };
  const read = await request.get(`/-/api/agent/prompt?after=${seq - 1}&timeout=0&listener=files`);
  const { prompt } = (await read.json()) as { prompt: string };
  expect(prompt).toContain("- file lines, source/greet.ts:2-3, /-/files/sample/greet.ts#L2-L3");

  // A file outside the folders, or lines that disagree with the address, are refused.
  const refused = await request.post("/-/api/chat/reader", {
    data: { text: "x", context: [{ ...lines, source: "content/document.json" }] },
  });
  expect(refused.status()).toBe(400);
  expect((await request.get("/-/api/files/sample/../content/document.json")).status()).not.toBe(
    200,
  );
});

test("Show on page finds lines again after the file changed", async ({ page }) => {
  const file = path.join(root, "source/greet.ts");
  const original = readFileSync(file, "utf8");
  try {
    await page.goto("/-/files/sample/greet.ts");
    const code = page.locator("main article [data-file]");
    await code.evaluate((region) => {
      const range = document.createRange();
      range.selectNodeContents(region.querySelector("[data-line='2']") as Node);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
    });
    await page
      .getByRole("toolbar", { name: "Selection actions" })
      .getByRole("button", { name: "Ask", exact: true })
      .click();
    await page.getByLabel("Message", { exact: true }).fill("What does this line build?");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    // Two lines are added above; the open view reloads the file.
    writeFileSync(file, `// A greeting.\n\n${original}`);
    await expect(code.locator("[data-line]")).toHaveCount(6);
    await page.getByRole("button", { name: "Show greet.ts, line 2 on the page" }).last().click();
    await expect(page).toHaveURL(/\/-\/files\/sample\/greet\.ts#L4$/);
    await expect(code.locator("[data-line='4'][data-selected]")).toHaveCount(1);
  } finally {
    writeFileSync(file, original);
  }
});

test("Show on page shows the section when the text asked about was rewritten", async ({ page }) => {
  const file = path.join(root, "content/first-page.mdx");
  const original = readFileSync(file, "utf8");
  try {
    await page.goto("/first-page");
    const target = page.locator("main article p").filter({ hasText: "The target paragraph" });
    await target.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
    });
    await page
      .getByRole("toolbar", { name: "Selection actions" })
      .getByRole("button", { name: "Ask", exact: true })
      .click();
    await page.getByLabel("Message", { exact: true }).fill("Can you say this more simply?");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    // The agent rewrites the paragraph in answer, so the exact text is gone.
    writeFileSync(
      file,
      original.replace(/^The target paragraph.*$/m, "The agent rewrote this paragraph."),
    );
    await expect(page.getByText("The agent rewrote this paragraph.")).toBeVisible();
    await page.evaluate(() => document.querySelector("[data-scroll-root]")?.scrollTo(0, 1e6));
    await page
      .getByRole("button", { name: /^Show .* on the page$/ })
      .last()
      .click();
    await expect(page.getByRole("heading", { name: "Selection target" })).toBeInViewport();
    await expect(
      page.getByText("This text changed since you asked. Showing where it was."),
    ).toBeVisible();
  } finally {
    writeFileSync(file, original);
  }
});

/** Click a line's number, as a reader picks lines on GitHub. */
function lineNumber(page: Page, line: number) {
  return page.locator(`main article [data-file] [data-line="${line}"]`).first();
}

test("clicking line numbers selects lines, and the selection menu asks about them", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/-/files/sample/greet.ts");
  await lineNumber(page, 2).click({ position: { x: 4, y: 4 } });
  await expect(page).toHaveURL(/greet\.ts#L2$/);
  await lineNumber(page, 3).click({ position: { x: 4, y: 4 }, modifiers: ["Shift"] });
  await expect(page).toHaveURL(/greet\.ts#L2-L3$/);
  await expect(page.locator("[data-selected]")).toHaveCount(2);
  // The picked lines are the text selection, so the selection menu offers Copy link and Ask.
  const menu = page.getByRole("toolbar", { name: "Selection actions" });
  await menu.getByRole("button", { name: "Copy link" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(
    /\/-\/files\/sample\/greet\.ts#L2-L3$/,
  );
  await lineNumber(page, 2).click({ position: { x: 4, y: 4 } });
  await lineNumber(page, 3).click({ position: { x: 4, y: 4 }, modifiers: ["Shift"] });
  await menu.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.locator(".context-items")).toContainText("greet.ts, lines 2–3");

  // Clicking the code itself selects text as usual; no line is picked.
  await page
    .locator("main article [data-file] [data-line='1']")
    .click({ position: { x: 200, y: 4 } });
  await expect(page).toHaveURL(/greet\.ts#L2-L3$/);

  // A number in an excerpt opens the file at that line.
  await page.goto("/source-code");
  await lineNumber(page, 3).click({ position: { x: 4, y: 4 } });
  await expect(page).toHaveURL(/\/-\/files\/sample\/greet\.ts#L3$/);
  await expect(page.locator("[data-selected]")).toHaveCount(1);
});

test("an agent gets the selected code's file, lines, and words, and answers with code", async ({
  page,
  request,
}) => {
  expect((await request.post("/-/api/chat/clear")).status()).toBe(201);
  // The reader picks two lines in the file view, and one word in an excerpt on a page.
  await page.goto("/-/files/sample/greet.ts");
  await lineNumber(page, 2).click({ position: { x: 4, y: 4 } });
  await lineNumber(page, 3).click({ position: { x: 4, y: 4 }, modifiers: ["Shift"] });
  const menu = page.getByRole("toolbar", { name: "Selection actions" });
  await menu.getByRole("button", { name: "Ask", exact: true }).click();
  await page.goto("/source-code");
  await page.locator("main article [data-file] [data-line='2']").evaluate((line) => {
    const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const at = (node as Text).data.indexOf("Hello");
      if (at < 0) continue;
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + "Hello".length);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
      return;
    }
  });
  await menu.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.locator(".context-items")).toContainText("greet.ts, line 2: “Hello”");
  await page.getByLabel("Message", { exact: true }).fill("Why does it build the text first?");
  await page.getByRole("button", { name: "Send", exact: true }).click();

  // The agent connects and reads where to look: the file from its folder, the lines, the words.
  const state = (await (await request.get("/-/api/chat")).json()) as ChatState;
  expect(state.start).toContain("- sample: source");
  const [start] = snippets(state.start);
  const read = await runSnippet(start ?? "");
  expect(read.stderr).toBe("");
  expect(read.stdout).toContain("--- reader ---\nWhy does it build the text first?");
  expect(read.stdout).toContain(
    "- file lines, source/greet.ts:2-3, /-/files/sample/greet.ts#L2-L3\n",
  );
  expect(read.stdout).toContain(
    "- file text, source/greet.ts:2, /-/files/sample/greet.ts#L2: “Hello”",
  );
  // The path opens from the project folder, where the agent runs.
  const lines = readFileSync(path.join(root, "source/greet.ts"), "utf8").split("\n");
  expect(lines.slice(1, 3).join("\n")).toContain("return text;");

  // It answers with the code and a link to the line.
  const [replyAndWait] = snippets(read.stdout);
  const waiting = runSnippet(
    replyAndWait ?? "",
    [
      "The function names the text before it returns it, so [line 2](/-/files/sample/greet.ts#L2) reads as one step.",
      "",
      '<Excerpt from="/-/files/sample/greet.ts" start="const text" end="return" mark="const" />',
      "",
    ].join("\n"),
  );
  const answer = page.locator(".agent-message").last();
  await expect(answer.locator("[data-file] [data-line]")).toHaveCount(2);
  await expect(answer.locator("[data-line='2'][data-mark=highlight]")).toHaveCount(1);
  await answer.getByRole("link", { name: "line 2" }).click();
  await expect(page).toHaveURL(/\/-\/files\/sample\/greet\.ts#L2$/);
  // A reply naming a file the document cannot show is refused, with the reason.
  const [again] = snippets(read.stdout);
  const refused = await runSnippet(again ?? "", "See [this](/-/files/sample/missing.ts).\n");
  expect(refused.stderr).toContain("names no file it can show");
  // Clearing ends the agent's wait.
  await request.post("/-/api/chat/clear");
  expect((await waiting).stdout).toContain("The reader cleared the chat");
});
