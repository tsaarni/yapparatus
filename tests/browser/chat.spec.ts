import { spawn } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { type APIRequestContext, expect, test } from "@playwright/test";
import {
  agentHeader,
  type Chat,
  type ContextItem,
  type DiagnosticReport,
  type DocumentDiagnostics,
} from "../../src/protocol.ts";
import { pageRevision } from "../../src/source-plugin.ts";
import { replySnippet, root, runSnippet, snippets } from "./workspace.ts";

/** A page with no excerpts or charts, so its revision is its text's. */
const testPage = "content/first-page.mdx";
const revisionOf = (source: string) =>
  pageRevision(readFileSync(path.join(root, source), "utf8"), []);

/** Report findings for the page as it is now, as a browser that rendered it would. */
function report(request: APIRequestContext, diagnostics: DiagnosticReport["diagnostics"]) {
  return request.post("/-/api/diagnostics", {
    data: { source: testPage, revision: revisionOf(testPage), diagnostics },
  });
}

/** Change the page, so it has a new revision and the findings of the old one stop counting. */
function changePage() {
  appendFileSync(path.join(root, testPage), "\n");
}

/** A reader message, as the browser sends it. */
async function readerMessage(request: APIRequestContext, text: string): Promise<number> {
  const created = await request.post("/-/api/chat", {
    data: { author: "reader", text, context: [] },
  });
  expect(created.status()).toBe(201);
  return ((await created.json()) as { seq: number }).seq;
}

/** An agent's read: the unanswered reader messages and the errors it has not been given. */
async function agentRead(request: APIRequestContext, agent: string) {
  return request.get("/-/api/chat?author=reader&include=diagnostics", {
    headers: { [agentHeader]: agent },
  });
}

/** Answer every reader message, so the next wait is not ended by messages from earlier tests. */
async function answerAll(request: APIRequestContext) {
  const read = (await (await agentRead(request, `cleanup-${Date.now()}`)).json()) as Chat;
  if (read.messages.length)
    expect(
      (await request.post("/-/api/chat", { data: { author: "agent", mdx: "Noted." } })).status(),
    ).toBe(204);
}

const reply = `# The fallback read

The API owns the read; see [the selection target](first-page#selection-target).

<Icon name="lucide:git-branch" label="Fallback branch" />

<Diagram id="answer-flow" caption="Reply diagram" draw={(d) => {
  const api = d.box("API")
  const db = d.cylinder("Database")
  d.place(db, { rightOf: api })
  d.arrow(api, db, { id: "fallback-read", label: "read" })
}} />

Backticks \`stay\` and $HOME is not expanded.
`;

test("an agent that stops while waiting is away at once", async ({ page }) => {
  await page.goto("/");
  await page.locator(".ask-action").click();
  // First in this file, so no earlier read leaves an agent counted as waiting.
  await expect(page.locator(".presence")).toHaveText("Agent not connected");
  const agent = spawn(
    process.execPath,
    [
      "--input-type=module-typescript",
      "-e",
      'import { waitForMessage } from "yapparatus/agent"; await waitForMessage();',
    ],
    { cwd: root },
  );
  await expect(page.locator(".presence")).toHaveText("Agent connected");
  agent.kill();
  await expect(page.locator(".presence")).toHaveText("Agent not connected", { timeout: 2000 });
  await expect(page.locator(".connect")).toBeVisible();
});

test("the agent channel: reader messages, wait, reply, checks, and the next wait", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "First page" })).toBeVisible();

  // The reader selects a paragraph and a diagram part, and sends a message.
  const target = page.locator("main article p").filter({ hasText: "The target paragraph" });
  await target.scrollIntoViewIfNeeded();
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
  await page.locator("article [data-element-id=fixture-edge] text").click();
  await expect(page.locator(".context-items > div")).toHaveCount(2);
  await page
    .getByLabel("Message", { exact: true })
    .fill("How does the miss edge relate to this paragraph?");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.locator(".reader-message")).toHaveCount(1);
  await expect(page.locator(".presence")).toHaveText("Agent not connected");
  await expect(page.locator(".connect")).toBeVisible();

  // The agent connects with the start prompt and gets the message with its context.
  const state = (await (await request.get("/-/api/chat")).json()) as Chat;
  const [start] = snippets(state.prompt);
  const first = await runSnippet(start ?? "");
  expect(first.stderr).toBe("");
  expect(first.stdout).toMatch(/^Reader, \d\d:\d\d:$/m);
  expect(first.stdout).not.toMatch(/#\d+ reader/);
  expect(first.stdout).toContain(
    "--- reader ---\nHow does the miss edge relate to this paragraph?",
  );
  expect(first.stdout).toMatch(
    /- text, content\/first-page\.mdx:\d+, \/first-page#[a-z-]+: “The target paragraph/,
  );
  expect(first.stdout).toMatch(
    /- diagram part, content\/first-page\.mdx:\d+-\d+, \/first-page#fixture-flow--fixture-edge/,
  );
  const replyAndWait = replySnippet(first.stdout);
  expect(replyAndWait).toContain("await sendReply();");

  // Replies are checked before they are accepted.
  const broken = await runSnippet(replyAndWait, "<Figure>\n\n{oops\n");
  expect(broken.code).not.toBe(0);
  expect(broken.stderr).toContain("The reply was not sent:");
  expect(broken.stderr).toMatch(/^- error COMPILE_FAILED line \d+: /m);
  const unknown = await runSnippet(replyAndWait, "<Bogus />\n\nSee [nowhere](nowhere).\n");
  expect(unknown.stderr).toContain("- error UNKNOWN_COMPONENT: <Bogus> is not a component");
  expect(unknown.stderr).toContain(
    '- error BROKEN_LINK line 3: No page matches the link "nowhere"',
  );
  // A refused reply carries the same problems as data, for code that catches the error.
  const caught = await runSnippet(
    'import { sendReply } from "yapparatus/agent"; try { await sendReply(); } catch (error) { console.log(JSON.stringify(error.diagnostics)); }',
    "See [nowhere](nowhere).\n",
  );
  expect(JSON.parse(caught.stdout)).toEqual([
    expect.objectContaining({ origin: "reply", code: "BROKEN_LINK", line: 1, subject: "nowhere" }),
  ]);
  const empty = await runSnippet(replyAndWait, "");
  expect(empty.stderr).toContain("- error REPLY_EMPTY: The reply is empty");

  // A marker on the window shows that page edits and replies arrive without a reload.
  await page.evaluate(() => Object.assign(window, { notReloaded: true }));
  // The agent edits the page: it updates in place, numbers and all.
  const sourcePath = path.join(root, "content/first-page.mdx");
  writeFileSync(
    sourcePath,
    readFileSync(sourcePath, "utf8")
      .replace("may change", "can change")
      .concat("\n## Added by the agent\n\nA new section.\n"),
  );
  await expect(page.locator("main article")).toContainText("can change");
  await expect(page.locator("main article h2").last()).toHaveText(/^1\.\d+\s*Added by the agent$/);
  // It replies and waits for the next message in the same run.
  const next = runSnippet(replyAndWait, reply);
  await expect(page.getByRole("heading", { name: "The fallback read" })).toBeVisible();
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => "notReloaded" in window)).toBe(true);
  await expect(page.locator(".presence")).toHaveText("Agent connected");
  await expect(page.locator(".chat .figure-scroll > svg")).toHaveCount(1);
  await expect(
    page.locator('.chat figure[id$="-answer-flow"] [data-element-id=fallback-read]'),
  ).toBeVisible();
  await expect(page.getByRole("img", { name: "Fallback branch" })).toBeVisible();
  await expect(page.locator(".agent-message")).toContainText(
    "Backticks stay and $HOME is not expanded.",
  );
  await expect(page.locator("main article")).toContainText("can change");

  // The reader can always send; the waiting snippet returns with the new message.
  // Shift+Enter starts a new line; Enter sends.
  const message = page.getByLabel("Message", { exact: true });
  await message.fill("And make the diagram");
  await message.press("Shift+Enter");
  await message.pressSequentially("show it too.");
  await expect(message).toHaveValue("And make the diagram\nshow it too.");
  await message.press("Enter");
  await expect(message).toHaveValue("");
  const second = await next;
  expect(second.code).toBe(0);
  expect(second.stdout).toContain("And make the diagram\nshow it too.");
  expect(second.stdout).not.toContain("How does the miss edge relate");
  expect(second.stdout).toContain("await sendReply();");
  // The agent read the message and has no wait open, so it is not connected at once.
  await expect(page.locator(".working")).toHaveAttribute(
    "aria-label",
    "The agent is working on your message",
    { timeout: 2000 },
  );
  await expect(page.locator(".presence")).toHaveText("Agent working, not connected");
  // The header counts how long the agent has been working.
  await expect(page.locator(".elapsed")).toHaveText(/^\d+ s$/);

  // Show on page finds the original paragraph, and links in the reply work.
  await page
    .getByRole("button", { name: /^Show .* on the page$/ })
    .first()
    .click();
  await expect(target).toBeInViewport();
  await page.getByRole("link", { name: "the selection target" }).click();
  await expect(page).toHaveURL(/\/first-page#selection-target$/);
  await page.reload();
  await expect(page.getByRole("heading", { name: "The fallback read" })).toBeVisible();
  const saved = (await (await request.get("/-/api/chat")).json()) as Chat;
  expect(saved.messages.map((m) => m.author)).toEqual(["reader", "agent", "reader"]);
  expect(saved.repliedTo).toBe(1);
  const [asked, replied] = saved.messages;
  const selection = asked?.author === "reader" ? asked.context[0] : undefined;
  // The item is the address with the selected words, and the source range as the page had it.
  expect(selection?.address).toMatch(/^\/first-page#[a-z-]+:~:text=The%20target%20paragraph/);
  expect(selection && Object.keys(selection).sort()).toEqual([
    "address",
    "endLine",
    "kind",
    "source",
    "startLine",
  ]);
  expect(replied?.author === "agent" && replied.readAt).toBeTruthy();
  // The log is one JSON line per message, with no copy of the page.
  const log = readFileSync(path.join(root, ".yapparatus/content/chat.jsonl"), "utf8")
    .trim()
    .split("\n");
  expect(log.map((line) => (JSON.parse(line) as { seq: number }).seq)).toEqual([1, 2, 3]);
  expect(log[0]).not.toContain("pageSource");
  expect(errors).toEqual([]);
});

test("REST API: resources, status codes, waiting reads, agents, and origin check", async ({
  request,
}) => {
  expect((await request.get("/-/api/chat")).status()).toBe(200);
  const wrongMethod = await request.put("/-/api/chat");
  expect(wrongMethod.status()).toBe(405);
  expect(wrongMethod.headers().allow).toBe("GET, POST, DELETE");
  expect((await request.get("/-/api/nothing")).status()).toBe(404);

  // A browser reports what it found in a revision of a page; the list shows it with its address.
  const diagnostic = {
    origin: "runtime",
    code: "RUNTIME_FAILED",
    message: "A deliberate test error.",
  } as const;
  expect((await report(request, [diagnostic])).status()).toBe(204);
  // An error wakes the agent once it has stayed for a moment, so a flicker never does.
  await new Promise((resolve) => setTimeout(resolve, 2500));
  expect((await report(request, [{} as typeof diagnostic])).status()).toBe(400);
  // Codes come from the registry, and the registry decides severity: reports carry none.
  const unknownCode = await report(request, [
    { ...diagnostic, code: "MADE_UP" as typeof diagnostic.code },
  ]);
  expect(unknownCode.status()).toBe(400);
  expect(((await unknownCode.json()) as { error: string }).error).toContain("MADE_UP");
  // The server's own checks are not the browser's to report.
  expect((await report(request, [{ ...diagnostic, origin: "link" as "runtime" }])).status()).toBe(
    400,
  );
  // Reports are about a page at a revision, or a reply.
  const post = (data: unknown) => request.post("/-/api/diagnostics", { data });
  expect((await post({ source: testPage, diagnostics: [] })).status()).toBe(400);
  expect(
    (await post({ source: "content/document.json", revision: "x", diagnostics: [] })).status(),
  ).toBe(400);
  const listed = (await (await request.get("/-/api/diagnostics")).json()) as DocumentDiagnostics;
  expect(listed.diagnostics).toContainEqual(
    expect.objectContaining({
      code: "RUNTIME_FAILED",
      severity: "error",
      source: testPage,
      address: "/first-page",
    }),
  );

  // Reading the diagnostics gave the agent this error, so an agent's read does not repeat it.
  const seq = await readerMessage(request, "Any errors?");
  const read = await agentRead(request, "a");
  expect(read.status()).toBe(200);
  const chat = (await read.json()) as Chat;
  expect(chat.messages.map((m) => m.seq)).toContain(seq);
  expect(chat.diagnostics).toEqual([]);
  expect(chat.prompt).toContain(
    "- error RUNTIME_FAILED content/first-page.mdx, /first-page: A deliberate test error.",
  );
  expect(chat.prompt).toContain("No context: a question about the document in general.");
  // Unanswered messages stay in every read until the agent replies.
  const again = (await (await agentRead(request, "a")).json()) as Chat;
  expect(again.messages.map((m) => m.seq)).toContain(seq);
  const sent = await request.post("/-/api/chat", { data: { author: "agent", mdx: "None." } });
  expect(sent.status()).toBe(204);
  const idle = (await (await agentRead(request, "a")).json()) as Chat;
  expect(idle.messages).toEqual([]);
  expect(idle.diagnostics).toEqual([]);
  expect(idle.prompt).toContain("Nothing new. Wait again");
  // A new error ends a waiting read, with how to fix it and tell the reader.
  const waiting = request.get("/-/api/chat?author=reader&include=diagnostics&wait=20", {
    headers: { [agentHeader]: "a" },
  });
  await new Promise((resolve) => setTimeout(resolve, 300));
  await report(request, [diagnostic, { ...diagnostic, message: "Another test error." }]);
  const woken = (await (await waiting).json()) as Chat;
  expect(woken.messages).toEqual([]);
  expect(woken.diagnostics?.map((d) => d.message)).toEqual(["Another test error."]);
  expect(woken.prompt).toContain("The document has new errors.");
  expect(woken.prompt).toContain(
    "- new error RUNTIME_FAILED content/first-page.mdx, /first-page: Another test error.",
  );
  expect(woken.prompt).toContain(
    "await sendReply(); console.log((await waitForMessage()).prompt);",
  );
  // Each new error is in one read only.
  const past = (await (await agentRead(request, "a")).json()) as Chat;
  expect(past.diagnostics).toEqual([]);
  // The newest agent wins.
  expect((await agentRead(request, "b")).status()).toBe(200);
  const old = await agentRead(request, "a");
  expect(old.status()).toBe(409);
  expect(((await old.json()) as { error: string }).error).toContain("took over");
  // Reading the diagnostics lists them with their severity and takes over no one.
  const checked = await request.get("/-/api/diagnostics");
  expect(checked.status()).toBe(200);
  const document = (await checked.json()) as DocumentDiagnostics;
  expect(document.diagnostics).toContainEqual(
    expect.objectContaining({ code: "RUNTIME_FAILED", severity: "error" }),
  );
  expect(document.prompt).toContain(
    "- error RUNTIME_FAILED content/first-page.mdx, /first-page: A deliberate test error.",
  );
  expect((await agentRead(request, "b")).status()).toBe(200);
  expect((await request.get("/-/api/chat?wait=5")).status()).toBe(400);
  expect((await request.get("/-/api/chat?include=messages")).status()).toBe(400);

  const noText = await request.post("/-/api/chat", { data: { author: "agent" } });
  expect(noText.status()).toBe(400);
  const notJson = await request.post("/-/api/chat", {
    headers: { "Content-Type": "text/markdown" },
    data: "Hello.",
  });
  expect(notJson.status()).toBe(415);

  // A finding about a figure names its lines in the page as it is now, and its address.
  await report(request, [
    {
      origin: "chart",
      code: "CHART_OVERLAP",
      message: "A test overlap.",
      target: "fixture-flow",
    },
  ]);
  const lines = readFileSync(path.join(root, testPage), "utf8").split("\n");
  const start = lines.findIndex((line) => line.includes('<Diagram id="fixture-flow"')) + 1;
  const end = lines.findIndex((line, i) => i >= start && line.startsWith("}} />")) + 1;
  expect(
    ((await (await request.get("/-/api/diagnostics")).json()) as DocumentDiagnostics).prompt,
  ).toContain(
    `- warning CHART_OVERLAP content/first-page.mdx:${start}-${end}, /first-page#fixture-flow: A test overlap.`,
  );

  // A changed page has a new revision: the old findings stop counting, and until a browser
  // renders it, the page is unchecked and shows what was found before.
  changePage();
  const changed = (await (await request.get("/-/api/diagnostics")).json()) as DocumentDiagnostics;
  expect(changed.diagnostics.filter((d) => d.code === "RUNTIME_FAILED")).toEqual([]);
  expect(changed.unchecked).toContainEqual(
    expect.objectContaining({
      address: "/first-page",
      previous: expect.arrayContaining([
        expect.objectContaining({ message: "A deliberate test error." }),
      ]),
    }),
  );
  expect(changed.prompt).toMatch(
    /^- \/first-page\n {2}Found before the change, not checked since:\n {2}- error RUNTIME_FAILED/m,
  );

  const result = await request.post("/-/api/chat", {
    headers: { Origin: "https://example.org" },
    data: {},
  });
  expect(result.status()).toBe(403);
});

test("clearing the chat deletes it, starts numbering again, and refuses a late reply", async ({
  page,
  request,
}) => {
  const before = (await (await request.get("/-/api/chat")).json()) as Chat;
  const replyFiles = before.messages.flatMap((m) => (m.author === "agent" ? [m.module] : []));
  expect(replyFiles.length).toBeGreaterThan(0);
  await answerAll(request);
  // An agent waits from before the chat is cleared.
  const waiting = runSnippet(
    'import { waitForMessage } from "yapparatus/agent"; console.log((await waitForMessage()).prompt);',
  );
  await page.goto("/");
  await page.locator(".ask-action").click();
  await expect(page.locator(".presence")).toHaveText("Agent connected");
  // The header asks first; Escape keeps the chat.
  await page.getByRole("button", { name: "Clear chat" }).click();
  const confirm = page.getByRole("alertdialog", { name: "Clear the chat" });
  await expect(confirm.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(confirm).toHaveCount(0);
  await expect(page.locator(".reader-message").first()).toBeVisible();
  await page.getByRole("button", { name: "Clear chat" }).click();
  await confirm.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.locator(".reader-message, .agent-message")).toHaveCount(0);
  // Everything is gone from disk.
  for (const module of replyFiles) expect(existsSync(path.join(root, module))).toBe(false);
  expect(readFileSync(path.join(root, ".yapparatus/content/chat.jsonl"), "utf8")).toBe("");
  // A reply to a message from before the chat was cleared has nothing to answer.
  const stale = await runSnippet(
    'import { sendReply } from "yapparatus/agent"; await sendReply();',
    "Too late.",
  );
  expect(stale.stderr).toContain("There is no reader message to answer.");
  // The waiting agent gets the next message, and numbering starts again.
  await page.getByLabel("Message", { exact: true }).fill("A fresh start.");
  await page.getByLabel("Message", { exact: true }).press("Enter");
  const told = await waiting;
  expect(told.stdout).toContain("A fresh start.");
  const after = (await (await request.get("/-/api/chat")).json()) as Chat;
  expect(after.messages.map((m) => m.seq)).toEqual([1]);
});

test("whole targets: ask about a table, link a section, deep-link a diagram part", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await page.getByRole("button", { name: "Ask about Table 1.1" }).click();
  await expect(page.locator(".context-items > div")).toHaveCount(1);
  await expect(page.locator(".context-items")).toContainText("Table 1.1");
  await page.getByRole("button", { name: /^Copy link to Section 1\.1$/ }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toMatch(/\/first-page#[a-z-]+$/);
  // Copying a selected passage confirms on the button, then the menu closes; no notice.
  await page.locator("article [data-lead]").evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
  });
  const menu = page.getByRole("toolbar", { name: "Selection actions" });
  await menu.getByRole("button", { name: "Copy link" }).click();
  await expect(menu.getByRole("button", { name: "Copied" })).toBeVisible();
  await expect(menu).toHaveCount(0);
  await expect(page.locator(".notice")).toHaveCount(0);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(":~:text=");
  await page.goto("/first-page#fixture-flow--fixture-edge");
  await expect(page.locator("#fixture-flow--fixture-edge")).toBeInViewport();

  // The page title stands for the whole page.
  await page.getByRole("button", { name: "Ask about Chapter 1" }).click();
  await expect(page.locator(".context-items")).toContainText("Chapter 1 · First page");

  // A word inside a paragraph becomes a text fragment on its section's address.
  await page.goto("/");
  await page
    .locator("article p")
    .filter({ hasText: "The target paragraph" })
    .evaluate((element) => {
      const text = element.firstChild as Text;
      const start = text.data.indexOf("paragraph");
      const range = document.createRange();
      range.setStart(text, start);
      range.setEnd(text, start + "paragraph".length);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
    });
  await page
    .getByRole("toolbar", { name: "Selection actions" })
    .getByRole("button", { name: "Ask", exact: true })
    .click();
  const word = (
    await page.evaluate(
      () => JSON.parse(sessionStorage.getItem("yapparatus:context") ?? "[]") as ContextItem[],
    )
  ).at(-1);
  expect(word?.address).toMatch(/^\/first-page#[a-z-]+:~:text=paragraph$/);

  // A selection in a table row points at that row's line, not the whole table.
  const cell = page.locator("main article td").filter({ hasText: /^one$/ });
  await cell.scrollIntoViewIfNeeded();
  await cell.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
  });
  await page
    .getByRole("toolbar", { name: "Selection actions" })
    .getByRole("button", { name: "Ask", exact: true })
    .click();
  const row = (
    await page.evaluate(
      () => JSON.parse(sessionStorage.getItem("yapparatus:context") ?? "[]") as ContextItem[],
    )
  ).at(-1);
  const rowLine =
    readFileSync(path.join(root, "content/first-page.mdx"), "utf8")
      .split("\n")
      .indexOf("| one | 1 |") + 1;
  expect([row?.startLine, row?.endLine]).toEqual([rowLine, rowLine]);

  // A selection in a page's code block points at the code line selected.
  const codeLine = page.locator("main article [data-source-line]").filter({ hasText: "longer" });
  await codeLine.scrollIntoViewIfNeeded();
  await codeLine.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
  });
  await page
    .getByRole("toolbar", { name: "Selection actions" })
    .getByRole("button", { name: "Ask", exact: true })
    .click();
  const code = (
    await page.evaluate(
      () => JSON.parse(sessionStorage.getItem("yapparatus:context") ?? "[]") as ContextItem[],
    )
  ).at(-1);
  const longerLine =
    readFileSync(path.join(root, "content/first-page.mdx"), "utf8")
      .split("\n")
      .findIndex((line) => line.startsWith("export const longer")) + 1;
  expect(code?.kind).toBe("text");
  expect([code?.startLine, code?.endLine]).toEqual([longerLine, longerLine]);
});

test("diagnostics: the server checks unopened pages, wakes the agent, and tracks what was rendered", async ({
  page,
  request,
}) => {
  // The agent waits; no browser has the page open.
  await answerAll(request);
  const waiting = runSnippet(
    'import { waitForMessage } from "yapparatus/agent"; console.log((await waitForMessage()).prompt);',
  );
  await expect
    .poll(async () => ((await (await request.get("/-/api/chat")).json()) as Chat).agent)
    .toBe("waiting");
  // An edit breaks a link and adds a heading too deep. The server finds both and ends the wait.
  const file = path.join(root, "content/second-page.mdx");
  const original = readFileSync(file, "utf8");
  writeFileSync(file, `${original.trimEnd()}\n\nSee [gone](nowhere).\n\n#### Too deep\n`);
  const edited = readFileSync(file, "utf8").split("\n");
  const brokenLine = edited.indexOf("See [gone](nowhere).") + 1;
  const deepLine = edited.indexOf("#### Too deep") + 1;
  const told = await waiting;
  expect(told.stdout).toContain("The document has new errors.");
  expect(told.stdout).toContain(
    `- new error BROKEN_LINK content/second-page.mdx:${brokenLine}, /second-page:`,
  );
  expect(told.stdout).toContain(`HEADING_DEPTH content/second-page.mdx:${deepLine}, /second-page:`);
  // Only a browser checks diagrams: the reply links each change, and opening it checks the page.
  expect(told.stdout).toContain("link each change in your reply");
  expect(told.stdout).toMatch(/^- \/second-page$/m);
  // checkDocument() waits for the checks of an edit it has not seen yet.
  writeFileSync(file, `${original.trimEnd()}\n\nSee [elsewhere](nowhere-else).\n`);
  const checked = await runSnippet(
    'import { checkDocument } from "yapparatus/agent"; console.log((await checkDocument()).prompt);',
  );
  expect(checked.stderr).toBe("");
  expect(checked.stdout).toMatch(
    /^- error BROKEN_LINK content\/second-page\.mdx:\d+, \/second-page: .*nowhere-else/m,
  );
  // The same pages, to link in the reply.
  expect(checked.stdout).toMatch(/^- \/second-page$/m);
  // The fix clears it.
  writeFileSync(file, original);
  await expect
    .poll(async () =>
      (
        (await (await request.get("/-/api/diagnostics")).json()) as DocumentDiagnostics
      ).diagnostics.map((d) => d.code),
    )
    .not.toContain("BROKEN_LINK");
  // Showing the page in a browser marks it as checked.
  await page.goto("/second-page");
  await expect(page.locator("main article h1")).toBeVisible();
  await readerMessage(request, "Checked?");
  const prompt = async () => ((await (await agentRead(request, "c")).json()) as Chat).prompt;
  await expect.poll(prompt).not.toMatch(/^- \/second-page$/m);
  expect(await prompt()).not.toContain("content/second-page.mdx");
});

test("diagnostics: a removed page takes its errors with it", async ({ request }) => {
  const reported = async () =>
    ((await (await request.get("/-/api/diagnostics")).json()) as DocumentDiagnostics).diagnostics
      .filter((d) => d.source === "content/removed-page.mdx")
      .map((d) => d.source);
  const file = path.join(root, "content/removed-page.mdx");
  writeFileSync(file, "# Removed\n\n<Unclosed\n");
  await expect.poll(reported).not.toEqual([]);
  rmSync(file);
  await expect.poll(reported).toEqual([]);
});

test("the header lists diagnostics, and Ask attaches where one is", async ({ page, request }) => {
  await report(request, [
    {
      origin: "chart",
      code: "CHART_FAILED",
      message: "A test chart fails.",
      target: "test-figure",
    },
  ]);
  await page.goto("/second-page");
  await page.getByRole("button", { name: "1 error" }).click();
  await page.getByRole("button", { name: "Ask about CHART_FAILED" }).click();
  await expect(page).toHaveURL(/\/first-page/);
  await expect(page.getByLabel("Message", { exact: true })).toHaveValue(
    "Please fix this error: CHART_FAILED: A test chart fails.",
  );
  await expect(page.locator(".context-items")).toContainText("Chapter 1 · First page");
  // The page changes, the open tab renders the new revision, and the finding is gone.
  changePage();
  await expect(page.getByRole("button", { name: "1 error" })).toHaveCount(0);
});

test("sending a message scrolls the chat to it, even when scrolled up", async ({
  page,
  request,
}) => {
  for (let i = 0; i < 12; i++)
    await readerMessage(request, `Filler message ${i}\n\nwith a second paragraph.`);
  await page.goto("/");
  await page.locator(".ask-action").click();
  const thread = page.locator(".messages");
  const gap = () =>
    thread.evaluate((t) => Math.round(t.scrollHeight - t.scrollTop - t.clientHeight));
  await thread.evaluate((t) => {
    t.scrollTop = 0;
  });
  await expect.poll(gap).toBeGreaterThan(100);
  await page.getByLabel("Message", { exact: true }).fill("The newest message.");
  await page.getByLabel("Message", { exact: true }).press("Enter");
  await expect(page.locator(".reader-message").last()).toContainText("The newest message.");
  await expect.poll(gap).toBeLessThan(40);
  await expect(page.locator(".reader-message").last()).toBeInViewport();
});

test("a reply is a chat message: errors in the document do not hold it back", async ({
  request,
}) => {
  await readerMessage(request, "Fix it.");
  await agentRead(request, "gate");
  // While the agent works, an error appears. The agent reads the diagnostics before it
  // replies; the server does not refuse the reply.
  await report(request, [
    { origin: "runtime", code: "RUNTIME_FAILED", message: "Broken by an edit." },
  ]);
  const sent = await request.post("/-/api/chat", { data: { author: "agent", mdx: "Done." } });
  expect(sent.status()).toBe(204);
  changePage();
});
