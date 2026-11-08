import { spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import type { AgentPrompt, ChatState, ContextItem } from "../../src/protocol.ts";
import { root, runSnippet, snippets } from "./workspace.ts";

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
  // First in this file, so no earlier read leaves an agent counted as listening.
  await expect(page.locator(".presence")).toHaveText("Agent not connected");
  const agent = spawn(
    process.execPath,
    [
      "--input-type=module-typescript",
      "-e",
      'import { wait } from "yapparatus/agent"; await wait({ after: 9999 });',
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
  const state = (await (await request.get("/-/api/chat")).json()) as ChatState;
  const [start] = snippets(state.start);
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
  const [replyAndWait] = snippets(first.stdout);
  expect(replyAndWait).toContain("reply({ to: 1 })");

  // Replies are checked before they are accepted.
  const broken = await runSnippet(replyAndWait ?? "", "<Figure>\n\n{oops\n");
  expect(broken.code).not.toBe(0);
  expect(broken.stderr).toContain("The reply was not accepted");
  const unknown = await runSnippet(replyAndWait ?? "", "<Bogus />\n\nSee [nowhere](nowhere).\n");
  expect(unknown.stderr).toContain("<Bogus> is not a component");
  expect(unknown.stderr).toContain('No page matches the link "nowhere"');
  const empty = await runSnippet(replyAndWait ?? "", "");
  expect(empty.stderr).toContain("The reply is empty");

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
  const next = runSnippet(replyAndWait ?? "", reply);
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
  expect(second.stdout).toContain("reply({ to: 3 })");
  // The agent read the message and has no wait open, so it is not connected at once.
  await expect(page.locator(".working")).toHaveAttribute(
    "aria-label",
    "The agent is working on your message",
    { timeout: 2000 },
  );
  await expect(page.locator(".presence")).toHaveText("Agent working, not connected");
  // The header counts how long the agent has been working.
  await expect(page.locator(".elapsed")).toHaveText(/^\d+ s$/);

  // A reply's cursor cannot be ahead of the server.
  const wrong = await runSnippet(
    'import { reply } from "yapparatus/agent"; await reply({ to: 9999 });',
    "Hello.",
  );
  expect(wrong.stderr).toContain("There is no reader message to answer up to #9999.");

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
  const saved = (await (await request.get("/-/api/chat")).json()) as ChatState;
  expect(saved.messages.map((m) => m.author)).toEqual(["reader", "agent", "reader"]);
  expect(saved.repliedTo).toBe(1);
  const [asked, replied] = saved.messages;
  const selection = asked?.author === "reader" ? asked.context[0] : undefined;
  // The item is the address with the selected words, and the source range as the page had it.
  expect(selection?.address).toMatch(/^\/first-page#[a-z-]+:~:text=The%20target%20paragraph/);
  expect(selection && Object.keys(selection).sort()).toEqual([
    "address",
    "endLine",
    "hash",
    "kind",
    "source",
    "startLine",
  ]);
  expect(replied?.author === "agent" && replied.readAt).toBeTruthy();
  // The log is one JSON line per message, with no copy of the page.
  const log = readFileSync(path.join(root, ".yapparatus/chat.jsonl"), "utf8").trim().split("\n");
  expect(log.map((line) => (JSON.parse(line) as { seq: number }).seq)).toEqual([1, 2, 3]);
  expect(log[0]).not.toContain("pageSource");
  expect(errors).toEqual([]);
});

test("REST API: resources, status codes, waiting reads, listeners, and origin check", async ({
  request,
}) => {
  expect((await request.get("/-/api/chat")).status()).toBe(200);
  const wrongMethod = await request.delete("/-/api/chat");
  expect(wrongMethod.status()).toBe(405);
  expect(wrongMethod.headers().allow).toBe("GET");
  expect((await request.get("/-/api/nothing")).status()).toBe(404);

  // Diagnostic reports: one scope at a time, listed, and shown to the agent in the prompt.
  const scope = encodeURIComponent("runtime:test");
  const diagnostic = {
    origin: "runtime",
    severity: "error",
    code: "TEST_ERROR",
    message: "A deliberate test error.",
  };
  const put = (data: unknown, at = scope) => request.put(`/-/api/diagnostics/${at}`, { data });
  expect((await put({ diagnostics: [diagnostic] })).status()).toBe(204);
  // An error is numbered once it has stayed for a moment, so a flicker never wakes the agent.
  await new Promise((resolve) => setTimeout(resolve, 2500));
  expect((await put({ diagnostics: [{}] })).status()).toBe(400);
  // The server's own checks are not the browser's to write.
  expect((await put({ diagnostics: [] }, encodeURIComponent("links:x"))).status()).toBe(400);
  const listed = (await (await request.get("/-/api/diagnostics")).json()) as Array<{
    code: string;
    scope: string;
  }>;
  expect(listed).toContainEqual(
    expect.objectContaining({ code: "TEST_ERROR", scope: "runtime:test" }),
  );

  const created = await request.post("/-/api/chat/reader", {
    data: { text: "Any errors?", context: [] },
  });
  expect(created.status()).toBe(201);
  const { seq } = (await created.json()) as { seq: number };
  const read = await request.get(`/-/api/agent/prompt?after=${seq - 1}&timeout=0&listener=a`);
  expect(read.status()).toBe(200);
  const prompt = (await read.json()) as AgentPrompt;
  expect(prompt.messages.map((m) => m.seq)).toEqual([seq]);
  // The error is numbered before the cursor, so it is listed but not new.
  expect(prompt.prompt).toContain("- error TEST_ERROR: A deliberate test error.");
  expect(prompt.prompt).toContain("No context: a question about the document in general.");
  // The same cursor gives the same messages; an idle read says how to wait again.
  const again = (await (
    await request.get(`/-/api/agent/prompt?after=${seq - 1}&timeout=0&listener=a`)
  ).json()) as AgentPrompt;
  expect(again.messages.map((m) => m.seq)).toEqual([seq]);
  const idle = (await (
    await request.get(`/-/api/agent/prompt?after=${seq}&timeout=0&listener=a`)
  ).json()) as AgentPrompt;
  // Errors numbered before the cursor do not end a wait.
  expect(idle.messages).toEqual([]);
  expect(idle.newErrors).toEqual([]);
  expect(idle.prompt).toContain("Nothing new. Wait again");
  // A new error ends a waiting read, with how to fix it and reply or wait.
  const waiting = request.get(`/-/api/agent/prompt?after=${seq}&timeout=20&listener=a`);
  await new Promise((resolve) => setTimeout(resolve, 300));
  await put({ diagnostics: [diagnostic, { ...diagnostic, message: "Another test error." }] });
  const woken = (await (await waiting).json()) as AgentPrompt;
  expect(woken.messages).toEqual([]);
  expect(woken.newErrors.map((d) => d.message)).toEqual(["Another test error."]);
  expect(woken.prompt).toContain("The document has new errors.");
  expect(woken.prompt).toContain("- new error TEST_ERROR: Another test error.");
  // The next cursor is past the error, which took a number after the message.
  const cursor = Number(/reply\(\{ to: (\d+) \}\)/.exec(woken.prompt)?.[1]);
  expect(cursor).toBeGreaterThan(seq);
  // The newest listener wins.
  expect(
    (await request.get(`/-/api/agent/prompt?after=${seq}&timeout=0&listener=b`)).status(),
  ).toBe(200);
  const old = await request.get(`/-/api/agent/prompt?after=${seq}&timeout=0&listener=a`);
  expect(old.status()).toBe(409);
  expect(((await old.json()) as { error: string }).error).toContain("took over");
  expect((await request.get("/-/api/agent/prompt?after=-1")).status()).toBe(400);

  expect(
    (
      await request.post("/-/api/agent/reply?to=9999", {
        headers: { "Content-Type": "text/markdown" },
        data: "Hello.",
      })
    ).status(),
  ).toBe(409);
  expect((await request.delete(`/-/api/diagnostics/${scope}`)).status()).toBe(204);
  expect(await (await request.get("/-/api/diagnostics")).json()).toEqual([]);

  const result = await request.post("/-/api/chat/reader", {
    headers: { Origin: "https://example.org" },
    data: {},
  });
  expect(result.status()).toBe(403);
});

test("clearing the chat deletes it, keeps numbering, and tells a waiting agent", async ({
  page,
  request,
}) => {
  const before = (await (await request.get("/-/api/chat")).json()) as ChatState;
  const last = before.messages.at(-1)?.seq ?? 0;
  const replyFiles = before.messages.filter((m) => m.author === "agent").map((m) => m.seq);
  expect(replyFiles.length).toBeGreaterThan(0);
  // An agent waits from before the clear.
  const waiting = runSnippet(
    `import { wait } from "yapparatus/agent"; console.log((await wait({ after: ${last} })).prompt);`,
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
  const told = await waiting;
  expect(told.stdout).toContain("The reader cleared the chat.");
  const clearedAt = Number(/wait\(\{ after: (\d+) \}\)/.exec(told.stdout)?.[1]);
  expect(clearedAt).toBeGreaterThan(last);
  // Everything is gone from disk, and the next message continues the numbering.
  for (const seq of replyFiles)
    expect(existsSync(path.join(root, `.yapparatus/chat/${seq}.mdx`))).toBe(false);
  const log = readFileSync(path.join(root, ".yapparatus/chat.jsonl"), "utf8").trim().split("\n");
  expect(log).toHaveLength(1);
  await page.getByLabel("Message", { exact: true }).fill("A fresh start.");
  await page.getByLabel("Message", { exact: true }).press("Enter");
  const after = (await (await request.get("/-/api/chat")).json()) as ChatState;
  expect(after.messages.map((m) => m.seq > clearedAt)).toEqual([true]);
  // A reply to a message from before the clear says what happened.
  const stale = await runSnippet(
    `import { reply } from "yapparatus/agent"; await reply({ to: ${last} });`,
    "Too late.",
  );
  expect(stale.stderr).toContain("The reader cleared the chat.");
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
});

test("diagnostics: the server checks unopened pages, wakes the agent, and tracks what was rendered", async ({
  page,
  request,
}) => {
  const state = (await (await request.get("/-/api/chat")).json()) as ChatState;
  const last = state.messages.filter((m) => m.author === "reader").at(-1)?.seq ?? 0;
  // The agent waits; no browser has the page open.
  const waiting = runSnippet(
    `import { wait } from "yapparatus/agent"; console.log((await wait({ after: ${last} })).prompt);`,
  );
  await expect
    .poll(async () => ((await (await request.get("/-/api/chat")).json()) as ChatState).agent)
    .toBe("listening");
  // An edit breaks a link and adds a heading too deep. The server finds both and ends the wait.
  const file = path.join(root, "content/second-page.mdx");
  const original = readFileSync(file, "utf8");
  writeFileSync(file, `${original.trimEnd()}\n\nSee [gone](nowhere).\n\n#### Too deep\n`);
  const edited = readFileSync(file, "utf8").split("\n");
  const brokenLine = edited.indexOf("See [gone](nowhere).") + 1;
  const deepLine = edited.indexOf("#### Too deep") + 1;
  const told = await waiting;
  expect(told.stdout).toContain("The document has new errors.");
  expect(told.stdout).toContain(`- new error BROKEN_LINK content/second-page.mdx:${brokenLine}:`);
  expect(told.stdout).toContain(`HEADING_DEPTH content/second-page.mdx:${deepLine}:`);
  expect(told.stdout).toMatch(/Not checked since they changed.*content\/second-page\.mdx/);
  // The fix clears it.
  writeFileSync(file, original);
  await expect
    .poll(async () =>
      ((await (await request.get("/-/api/diagnostics")).json()) as Array<{ code: string }>).map(
        (d) => d.code,
      ),
    )
    .not.toContain("BROKEN_LINK");
  // Showing the page in a browser marks it as checked.
  await page.goto("/second-page");
  await expect(page.locator("main article h1")).toBeVisible();
  const created = await request.post("/-/api/chat/reader", {
    data: { text: "Checked?", context: [] },
  });
  const { seq } = (await created.json()) as { seq: number };
  await expect
    .poll(async () => {
      const read = await request.get(`/-/api/agent/prompt?after=${seq - 1}&timeout=0&listener=c`);
      return ((await read.json()) as AgentPrompt).prompt;
    })
    .not.toContain("content/second-page.mdx");
});

test("diagnostics: a removed page takes its errors with it", async ({ request }) => {
  const reported = async () =>
    ((await (await request.get("/-/api/diagnostics")).json()) as Array<{ source?: string }>)
      .filter((d) => d.source === "content/removed-page.mdx")
      .map((d) => d.source);
  const file = path.join(root, "content/removed-page.mdx");
  writeFileSync(file, "# Removed\n\n<Unclosed\n");
  await expect.poll(reported).not.toEqual([]);
  rmSync(file);
  await expect.poll(reported).toEqual([]);
});

test("the header lists diagnostics, and Ask attaches where one is", async ({ page, request }) => {
  const scope = encodeURIComponent("diagram:content/first-page.mdx#test-figure");
  await request.put(`/-/api/diagnostics/${scope}`, {
    data: {
      diagnostics: [
        {
          origin: "diagram",
          severity: "error",
          code: "TEST_OVERLAP",
          message: "Two test boxes overlap.",
          source: "content/first-page.mdx",
          target: "test-figure",
        },
      ],
    },
  });
  await page.goto("/second-page");
  await page.getByRole("button", { name: "1 error" }).click();
  await page.getByRole("button", { name: "Ask about TEST_OVERLAP" }).click();
  await expect(page).toHaveURL(/\/first-page/);
  await expect(page.getByLabel("Message", { exact: true })).toHaveValue(
    "Please fix this error: TEST_OVERLAP: Two test boxes overlap.",
  );
  await expect(page.locator(".context-items")).toContainText("Chapter 1 · First page");
  await request.delete(`/-/api/diagnostics/${scope}`);
  await expect(page.getByRole("button", { name: "1 error" })).toHaveCount(0);
});

test("sending a message scrolls the chat to it, even when scrolled up", async ({
  page,
  request,
}) => {
  for (let i = 0; i < 12; i++)
    await request.post("/-/api/chat/reader", {
      data: { text: `Filler message ${i}\n\nwith a second paragraph.`, context: [] },
    });
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

test("a reply is refused while errors that appeared after the agent read remain", async ({
  request,
}) => {
  const created = await request.post("/-/api/chat/reader", {
    data: { text: "Fix it.", context: [] },
  });
  const { seq } = (await created.json()) as { seq: number };
  const read = await request.get(`/-/api/agent/prompt?after=${seq - 1}&timeout=0&listener=gate`);
  const cursor = Number(
    /reply\(\{ to: (\d+) \}\)/.exec(((await read.json()) as AgentPrompt).prompt)?.[1],
  );
  // While the agent works, an error appears.
  const scope = encodeURIComponent("runtime:gate-test");
  await request.put(`/-/api/diagnostics/${scope}`, {
    data: {
      diagnostics: [
        { origin: "runtime", severity: "error", code: "GATE_ERROR", message: "Broken by an edit." },
      ],
    },
  });
  const refused = await request.post(`/-/api/agent/reply?to=${cursor}`, {
    headers: { "Content-Type": "text/markdown" },
    data: "Done.",
  });
  expect(refused.status()).toBe(422);
  const text = ((await refused.json()) as { error: string }).error;
  expect(text).toContain("The reply was not sent.");
  expect(text).toContain("- error GATE_ERROR: Broken by an edit.");
  // A cursor past the errors says the agent saw them and did not cause them.
  const past = Number(/past them:\n\n.*reply\(\{ to: (\d+) \}\)/s.exec(text)?.[1]);
  expect(past).toBeGreaterThan(cursor);
  // Fixed, the reply goes through with the original cursor.
  await request.delete(`/-/api/diagnostics/${scope}`);
  const sent = await request.post(`/-/api/agent/reply?to=${cursor}`, {
    headers: { "Content-Type": "text/markdown" },
    data: "Done.",
  });
  expect(sent.status()).toBe(201);
});
