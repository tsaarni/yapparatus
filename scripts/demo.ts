/**
 * Records the README demo, assets/demo-{light,dark}.webp, from the design document served in a
 * copy of the project, with a scripted reader and agent. See assets/README.md.
 */
import { type ChildProcess, spawn } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { type Browser, type CDPSession, chromium, type Locator, type Page } from "@playwright/test";
import { createServer } from "vite";
import { apiPrefix } from "../src/protocol/rest-api.ts";

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

/** The change the reader asks for, the edit the agent works out, and its reply. */
const change = {
  question: "Show the query parameters on this arrow.",
  file: "docs/design/agent-library.mdx",
  from: 'label: "GET /chat, wait"',
  to: 'label: "GET /chat?author=reader\\n&include=diagnostics\\n&wait=25"',
  reply: `The arrow now shows the read that the library sends, \`GET /chat?author=reader&include=diagnostics&wait=25\`, with one parameter on each line so that the label fits:

- \`author=reader\` returns only the reader's messages.
- \`include=diagnostics\` adds the document's new errors.
- \`wait=25\` lets the server hold the read for up to 25 s.

See [read the chat](rest-api#read-the-chat).
`,
};

/** How long the agent seems to work before it replies, shown in the reply's header. */
const workMs = 4000;

/** The viewport, the WebP's width, frame rate, and lossy quality, and how long it holds moments. */
const demo = {
  viewport: { width: 1280, height: 800 },
  width: 960,
  fps: 12,
  quality: 90,
  holdMs: 1500,
};

/** Where the pointer starts, over the chat panel. */
const start = { x: 900, y: 500 };

/** The port of the demo server, apart from the dev server's 5173 and the tests' 4173. */
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

/** When the script started, for the times in the log. */
const started = performance.now();

/** Print a step with the seconds since the script started. */
function log(step: string): void {
  const seconds = ((performance.now() - started) / 1000).toFixed(1).padStart(5);
  process.stdout.write(`${seconds} s  ${step}\n`);
}

const root = mkdtempSync(path.join(realpathSync(os.tmpdir()), "yapparatus-demo-"));
cpSync(".", root, {
  recursive: true,
  filter: (source) => !skipped.has(path.relative(".", source).split(path.sep)[0] ?? ""),
});
symlinkSync(path.resolve("node_modules"), path.join(root, "node_modules"), "dir");
const frames = mkdtempSync(path.join(realpathSync(os.tmpdir()), "yapparatus-demo-frames-"));
log(`copied the project to ${root}`);

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
    child.on("exit", (status, signal) => {
      agents.delete(child);
      if (status || (signal && signal !== "SIGTERM"))
        reject(new Error(`agent: ${code} exited with ${status ?? signal}`));
      else resolve();
    }),
  );
}

/** Scroll the scene's figure to the top of the page. */
async function scrollToFigure(page: Page): Promise<void> {
  await page
    .locator(`#${scene.figure}`)
    .evaluate((figure) => (figure.closest("figure") ?? figure).scrollIntoView({ block: "start" }));
}

/** A pointer drawn on the page, since headless Chromium draws none; it follows the mouse. */
function drawPointer(): void {
  addEventListener("DOMContentLoaded", () => {
    const pointer = document.createElement("div");
    pointer.innerHTML =
      '<svg width="22" height="28" viewBox="0 0 22 28"><path d="M2 2v20l5-5 4 9 3.5-1.5-4-8.5h7z" fill="#11141b" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    Object.assign(pointer.style, {
      position: "fixed",
      left: "-2px",
      top: "-2px",
      zIndex: "2147483647",
      pointerEvents: "none",
      opacity: "0",
      transition: "scale 120ms",
      transformOrigin: "2px 2px",
    });
    document.documentElement.append(pointer);
    addEventListener("mousemove", (event) => {
      pointer.style.opacity = "1";
      pointer.style.translate = `${event.clientX}px ${event.clientY}px`;
    });
    addEventListener("mousedown", () => {
      pointer.style.scale = "0.8";
    });
    addEventListener("mouseup", () => {
      pointer.style.scale = "1";
    });
  });
}

/** Where the mouse is, so that each move starts from the last one. */
const mouse = { ...start };

/** Move the mouse to the center of `target` along an eased path and click it. */
async function glideAndClick(page: Page, target: Locator): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error(`demo: ${target} has no box`);
  const from = { ...mouse };
  const to = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const steps = 30;
  for (let step = 1; step <= steps; step++) {
    const t = step / steps;
    const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    mouse.x = from.x + (to.x - from.x) * eased;
    mouse.y = from.y + (to.y - from.y) * eased;
    await page.mouse.move(mouse.x, mouse.y);
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(200);
  await page.mouse.down();
  await page.waitForTimeout(120);
  await page.mouse.up();
}

/** Select the scene's element, type `text` into the message box, and send it. */
async function ask(page: Page, text: string): Promise<void> {
  await glideAndClick(
    page,
    page.locator(`article [data-element-id=${scene.element}] text`).first(),
  );
  await page.waitForTimeout(600);
  const box = page.getByLabel("Message", { exact: true });
  await glideAndClick(page, box);
  await box.pressSequentially(text, { delay: 35 });
  await page.waitForTimeout(400);
  await glideAndClick(page, page.getByRole("button", { name: "Send", exact: true }));
}

/** A screencast of a page, written as JPEG frames with their times. */
class Recording {
  private readonly cdp: CDPSession;
  private readonly dir: string;
  private readonly frames: { file: string; time: number }[] = [];

  private constructor(cdp: CDPSession, dir: string) {
    this.cdp = cdp;
    this.dir = dir;
    cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
      const file = `frame-${String(this.frames.length).padStart(5, "0")}.jpg`;
      writeFileSync(path.join(this.dir, file), Buffer.from(data, "base64"));
      this.frames.push({ file, time: metadata.timestamp ?? Date.now() / 1000 });
      void cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
    });
  }

  /** Start recording `page` into frames under `dir`. */
  static async start(page: Page, dir: string): Promise<Recording> {
    mkdirSync(dir);
    const recording = new Recording(await page.context().newCDPSession(page), dir);
    await recording.cdp.send("Page.startScreencast", { format: "jpeg", quality: 92 });
    return recording;
  }

  /** Stop recording and encode the frames as an animated WebP at `file`. */
  async save(file: string): Promise<void> {
    await this.cdp.send("Page.stopScreencast");
    const lines = ["ffconcat version 1.0"];
    this.frames.forEach((frame, index) => {
      const next = this.frames[index + 1]?.time ?? frame.time + demo.holdMs / 1000;
      lines.push(`file ${frame.file}`, `duration ${Math.max(next - frame.time, 0.001).toFixed(3)}`);
    });
    lines.push(`file ${this.frames.at(-1)?.file}`);
    const list = path.join(this.dir, "frames.txt");
    writeFileSync(list, `${lines.join("\n")}\n`);
    const scaled = path.join(this.dir, "scaled");
    mkdirSync(scaled);
    const filter = `fps=${demo.fps},scale=${demo.width}:-1:flags=lanczos`;
    const pattern = path.join(scaled, "%05d.png");
    log(`encoding ${this.frames.length} frames`);
    await run("ffmpeg", ["-loglevel", "error", "-f", "concat", "-i", list, "-vf", filter, pattern]);
    const pictures = readdirSync(scaled).map((name) => path.join(scaled, name));
    const encoding = ["-sharp_yuv", "-lossy", "-q", String(demo.quality)];
    const duration = ["-d", String(Math.round(1000 / demo.fps))];
    log(`scaled to ${pictures.length} frames at ${demo.fps} fps`);
    await run("img2webp", [...encoding, ...duration, ...pictures, "-o", file]);
  }
}

/** Run a command and wait for it to exit with status 0; its errors show only if it fails. */
function run(command: string, args: string[]): Promise<void> {
  const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
  let errors = "";
  child.stderr.on("data", (chunk) => {
    errors += chunk;
  });
  return new Promise((resolve, reject) => {
    child.on("error", (error) => reject(new Error(`${command}: ${error.message}`)));
    child.on("exit", (status) =>
      status ? reject(new Error(`${command} exited with ${status}\n${errors}`)) : resolve(),
    );
  });
}

/** Clear the chat, restore the page, and stop the agents, so each recording starts the same. */
async function reset(original: string): Promise<void> {
  for (const child of agents) child.kill();
  writeFileSync(path.join(root, change.file), original);
  const response = await fetch(`http://127.0.0.1:${port}${apiPrefix}/chat`, { method: "DELETE" });
  if (!response.ok) throw new Error(`demo: clearing the chat failed with ${response.status}`);
  Object.assign(mouse, start);
}

/** Record the question, the reply, and the change in `colorScheme`, and save the WebP. */
async function record(browser: Browser, colorScheme: "light" | "dark"): Promise<void> {
  const page = await browser.newPage({ viewport: demo.viewport, colorScheme });
  await page.addInitScript(drawPointer);
  log(`${colorScheme}: opening the page`);
  await page.goto(`http://127.0.0.1:${port}/${scene.page}`);
  await page.getByRole("button", { name: "Chat", exact: true }).click();
  await scrollToFigure(page);
  await page.mouse.move(mouse.x, mouse.y);
  await page.waitForTimeout(1000);
  const recording = await Recording.start(page, path.join(frames, colorScheme));
  log(`${colorScheme}: recording`);
  await page.waitForTimeout(demo.holdMs);

  const read = agent("await a.waitForMessage();");
  await ask(page, question);
  log(`${colorScheme}: asked the question`);
  await read;
  log(`${colorScheme}: the agent read the question`);
  await page.waitForTimeout(workMs);
  await agent("await a.sendReply();", reply);
  log(`${colorScheme}: the agent replied`);
  const next = agent("await a.waitForMessage();");
  const show = page.getByRole("button", { name: /^Show .* on the page$/ });
  await show.waitFor();
  await page.waitForTimeout(demo.holdMs * 2);
  await glideAndClick(page, show);
  log(`${colorScheme}: showed the arrow on the page`);
  await page.waitForTimeout(demo.holdMs);

  await ask(page, change.question);
  log(`${colorScheme}: asked for the change`);
  await next;
  log(`${colorScheme}: the agent read the request`);
  await page.waitForTimeout(workMs / 2);
  const source = path.join(root, change.file);
  const text = readFileSync(source, "utf8");
  if (!text.includes(change.from)) throw new Error(`demo: ${change.file} has no ${change.from}`);
  writeFileSync(source, text.replace(change.from, change.to));
  log(`${colorScheme}: the agent edited ${change.file}`);
  await agent("await a.checkDocument();");
  log(`${colorScheme}: the agent checked the document`);
  await page.waitForTimeout(workMs / 2);
  await agent("await a.sendReply();", change.reply);
  log(`${colorScheme}: the agent replied`);
  void agent("await a.waitForMessage();").catch(() => {});
  await page.getByText(/^The arrow now shows/).waitFor();
  await page.waitForTimeout(demo.holdMs * 2);
  const file = path.join("assets", `demo-${colorScheme}.webp`);
  await recording.save(file);
  await page.close();
  log(`${colorScheme}: wrote ${file}`);
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
log("launched Chromium");
try {
  await server.listen();
  log(`serving docs/design on port ${port}`);
  const original = readFileSync(path.join(root, change.file), "utf8");
  for (const colorScheme of ["light", "dark"] as const) {
    await reset(original);
    await record(browser, colorScheme);
  }
} finally {
  for (const child of agents) child.kill();
  await browser.close();
  await server.close();
  rmSync(root, { recursive: true, force: true });
  rmSync(frames, { recursive: true, force: true });
  log("removed the temporary folders");
}
process.exit(0);
