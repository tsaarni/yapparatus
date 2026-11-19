/**
 * Takes the README screenshots, assets/screenshot-{light,dark}.png, from the design document
 * served in a copy of the project, with a scripted question and agent reply. See assets/README.md.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { cpSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, type Page } from "@playwright/test";
import { createServer } from "vite";

/** The page, the figure, and the diagram element the question is about. */
const scene = { page: "agent-library", figure: "agent-round", element: "get-chat-wait" };

/** The question the reader asks about the element. */
const question = "Why does the library wait on GET /chat instead of polling the server?";

/** The agent's reply, in MDX. Keep it true to the design document. */
const reply = `Holding the request open lets the server answer as soon as the user sends a message, so the agent gets it without a delay and without extra requests.

- **Polling costs model turns.** An agent that a timer wakes spends a turn on every wake, even when no one has written. A blocking \`waitForMessage()\` costs nothing until a message arrives.
- **Each read stays short.** The server holds a read for 25 s, and the library repeats it. Node's \`fetch\` gives up after 300 s, and a restart of the server drops a waiting request, so one long request would break.
- **An open read tells the server that the agent is listening.** The panel header shows "Agent connected" only while a read is open.

See [waitForMessage](agent-library#waitformessage) and [the agent state](server#agent-state).
`;

/** How long the agent seems to work before it replies, shown in the reply's header. */
const workMs = 9000;

/** The port of the screenshot server, apart from the dev server's 5173 and the tests' 4173. */
const port = 5180;

/** Top-level entries of the project that the workspace leaves out. */
const skipped = new Set([
  "node_modules",
  ".git",
  ".yapparatus",
  ".cache",
  "dist",
  "dist-single",
  "test-results",
  "playwright-report",
  "starter",
]);

const root = mkdtempSync(path.join(realpathSync(os.tmpdir()), "yapparatus-screenshots-"));
cpSync(".", root, {
  recursive: true,
  filter: (source) => !skipped.has(path.relative(".", source).split(path.sep)[0] ?? ""),
});
symlinkSync(path.resolve("node_modules"), path.join(root, "node_modules"), "dir");

/** The agent processes, stopped before the server so a waiting one does not report it gone. */
const agents = new Set<ChildProcess>();

/** Run agent library code in the workspace as the agent does, with `input` on stdin. */
function agent(code: string, input?: string): Promise<void> {
  const child = spawn(
    process.execPath,
    ["--input-type=module", "-e", `import * as a from "./lib/agent/index.js"; ${code}`],
    { cwd: root, stdio: [input === undefined ? "ignore" : "pipe", "ignore", "inherit"] },
  );
  agents.add(child);
  child.stdin?.end(input);
  return new Promise((resolve, reject) =>
    child.on("exit", (status) => {
      agents.delete(child);
      if (status) reject(new Error(`agent: ${code} exited with ${status}`));
      else resolve();
    }),
  );
}

/** Ask the question about the scene's element in the chat panel. */
async function ask(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Chat", exact: true }).click();
  await page.locator(`article [data-element-id=${scene.element}] text`).first().click();
  await page.getByLabel("Message", { exact: true }).fill(question);
  await page.getByRole("button", { name: "Send", exact: true }).click();
}

/** Show the referenced element, scroll its figure to the top, and save the screenshot. */
async function capture(page: Page, file: string): Promise<void> {
  const connected = page.getByText("Agent connected", { exact: true });
  if (!(await connected.isVisible()))
    await page.getByRole("button", { name: "Chat", exact: true }).click();
  await connected.waitFor();
  await page.getByRole("button", { name: /^Show .* on the page$/ }).click();
  await page
    .locator(`#${scene.figure}`)
    .evaluate((figure) => (figure.closest("figure") ?? figure).scrollIntoView({ block: "start" }));
  await page.mouse.move(1200, 600);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: file });
}

const { yapparatus } = (await import(
  path.join(root, "lib", "vite", "plugin.js")
)) as typeof import("../src/vite/plugin.ts");
const server = await createServer({
  root,
  configFile: false,
  logLevel: "warn",
  cacheDir: path.join(root, ".vite"),
  plugins: yapparatus({ document: "docs/design" }),
  server: {
    host: "127.0.0.1",
    port,
    strictPort: true,
    fs: { allow: [root, path.resolve("node_modules")] },
  },
});
const browser = await chromium.launch();
try {
  await server.listen();
  const url = `http://127.0.0.1:${port}/${scene.page}`;
  const viewport = { width: 1440, height: 900 };
  const first = await browser.newPage({ viewport });
  await first.goto(url);
  const read = agent("await a.waitForMessage();");
  await ask(first);
  await read;
  await first.close();
  await new Promise((resolve) => setTimeout(resolve, workMs));
  await agent("await a.sendReply();", reply);
  void agent("await a.waitForMessage();").catch(() => {});
  for (const colorScheme of ["light", "dark"] as const) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 2, colorScheme });
    await page.goto(url);
    await capture(page, path.join("assets", `screenshot-${colorScheme}.png`));
    process.stdout.write(`wrote assets/screenshot-${colorScheme}.png\n`);
    await page.close();
  }
} finally {
  for (const child of agents) child.kill();
  await browser.close();
  await server.close();
  rmSync(root, { recursive: true, force: true });
}
process.exit(0);
