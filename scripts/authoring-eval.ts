/**
 * Measures how well a coding agent writes and revises a document from the starter's guide alone:
 * a fresh project, a sample repository, a first message, then comments on what a reader selects.
 */
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import {
  cpSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { type Browser, chromium, type Page } from "@playwright/test";

/** The repository the agent documents, copied next to each project as `orders/`. */
const subject = path.resolve("tests/eval/orders");

/** The one message the reader sends: all the agent is told besides what Yapparatus prints. */
const request =
  "Write a short document about the order service in ../orders for engineers who are new to the team.";

/**
 * What a reader does after each reply, in the browser: select something, comment on it, and
 * later judge the pages. `select` returns the page it selected on, or undefined if it found none.
 */
interface FollowUp {
  name: string;
  text: string;
  select: (page: Page, url: string, project: string) => Promise<string | undefined>;
  passed: (before: Map<string, string>, after: Map<string, string>, on: string) => boolean;
}

/** The reader's comments after the first reply: a diagram element, then lines of a file. */
const followUps: FollowUp[] = [
  {
    name: "element",
    text: "Which settings in config.yaml control this? Add them to the page as a table under this figure.",
    select: async (page, url, project) => {
      for (const name of pageNames(project)) {
        await page.goto(`${url}/${name}`, { waitUntil: "networkidle" });
        const element = page
          .locator('article [data-element-id*="cache"]:not([data-element-id*="->"])')
          .first();
        if (!(await element.count())) continue;
        await element.scrollIntoViewIfNeeded();
        await element.locator("text").first().click();
        return name;
      }
      return undefined;
    },
    passed: (before, after, on) => {
      const tables = (text = "") => text.match(/<Table\b/g)?.length ?? 0;
      const file = `${on}.mdx`;
      return tables(after.get(file)) > tables(before.get(file));
    },
  },
  {
    name: "lines",
    text: "Is the jitter in this backoff explained anywhere in the document? If not, add it where retries are described.",
    select: async (page, url, project) => {
      const doc = JSON.parse(readFileSync(path.join(project, "content", "document.json"), "utf8"));
      const orders = path.resolve(project, "..", "orders");
      const name = Object.entries((doc.files ?? {}) as Record<string, string>).find(
        ([, dir]) => path.resolve(project, "content", dir) === orders,
      )?.[0];
      if (!name) return undefined;
      const lines = readFileSync(path.join(orders, "internal/worker/worker.go"), "utf8").split(
        "\n",
      );
      const first = lines.findIndex((line) => line.startsWith("func (w *Worker) retry(")) + 1;
      const last = lines.findIndex((line, i) => i >= first && line === "}") + 1;
      await page.goto(`${url}/-/files/${name}/internal/worker/worker.go`);
      const code = page.locator("main article [data-file]");
      await code.locator(`[data-line='${last}']`).waitFor();
      await code.locator(`[data-line='${first}']`).scrollIntoViewIfNeeded();
      await code.evaluate(
        (region, [from, to]) => {
          const range = document.createRange();
          const end = region.querySelector(`[data-line='${to}']`) as Node;
          range.setStart(region.querySelector(`[data-line='${from}']`) as Node, 0);
          range.setEnd(end, end.childNodes.length);
          window.getSelection()?.removeAllRanges();
          window.getSelection()?.addRange(range);
        },
        [first, last],
      );
      await page
        .getByRole("toolbar", { name: "Selection actions" })
        .getByRole("button", { name: "Comment", exact: true })
        .click();
      return `/-/files/${name}/internal/worker/worker.go`;
    },
    passed: (_before, after) => [...after.values()].some((text) => /jitter/i.test(text)),
  },
];

/** A follow-up as it went: when it was sent and answered, what changed, and whether it passed. */
interface FollowUpResult {
  name: string;
  on?: string;
  minutes?: number;
  changed: string[];
  passed: boolean;
}

/** How long a run may take before it is stopped, and how long the agent gets to stop by itself. */
const limits = { runMs: 45 * 60_000, stopMs: 3 * 60_000 };

/** The id the harness reads the chat with, which ends the agent's wait once it has replied. */
const harnessAgent = "authoring-eval";

/** Components and diagram calls counted in the pages, by name and pattern. */
const features: Record<string, RegExp> = {
  Diagram: /<Diagram\b/g,
  Step: /<Step\b/g,
  build: /<Diagram\b[^>]*\bbuild\b/g,
  sequence: /d\.sequence\(/g,
  tree: /d\.tree\(/g,
  record: /d\.record\(/g,
  marks: /\bmarks:/g,
  Chart: /<Chart\b/g,
  Table: /<Table\b/g,
  Listing: /<Listing\b/g,
  Excerpt: /<Excerpt\b/g,
  Ref: /<Ref\b/g,
  Figure: /<Figure\b/g,
  FileTree: /<FileTree\b/g,
  Tabs: /<Tabs\b/g,
  Columns: /<Columns\b/g,
  Icon: /<Icon\b/g,
  alert: /^> \[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/gm,
  math: /\$\$/g,
  fileLink: /\]\(\/-\/files\//g,
};

/** Writing rules from the guide that a pattern can find in the pages. */
const violations: Record<string, RegExp> = {
  emDash: /—/g,
  typedNumber: /\b(Figure|Table|Listing|Section) \d/g,
  positional: /\b(the|this) (table|figure|diagram|chart|listing|code) (below|above)\b/gi,
};

/** Fenced code blocks that open without a language, which the guide asks for on every block. */
function bareFences(text: string): number {
  let open = false;
  let bare = 0;
  for (const line of text.split("\n")) {
    const fence = line.match(/^\s*```(\S*)/);
    if (!fence) continue;
    if (!open && !fence[1]) bare++;
    open = !open;
  }
  return bare;
}

/** One run's results. */
interface RunResult {
  label: string;
  run: number;
  /** The model the agent ran on, as its stream names it, such as `claude-haiku-5-5`. */
  model: string | undefined;
  ended: "replied" | "exited" | "timeout";
  minutes: number;
  /** The agent's actions: every tool call, in all rounds. */
  toolCalls: number;
  turns: number;
  tokens: { input: number; cacheRead: number; cacheWrite: number; output: number };
  docsRead: string[];
  checks: number[];
  pictures: number;
  refusedReplies: number;
  pages: number;
  words: number;
  finalErrors: number;
  finalWarnings: number;
  codes: Record<string, number>;
  features: Record<string, number>;
  violations: Record<string, number>;
  followUps: FollowUpResult[];
  /** Per reader message: the agent's tool calls and the diagnostics at each check. */
  rounds: { tools: number; checks: number[] }[];
}

/** The command-line options. */
const { values } = parseArgs({
  options: {
    label: { type: "string" },
    ref: { type: "string" },
    runs: { type: "string", default: "1" },
    model: { type: "string", default: "haiku" },
    out: {
      type: "string",
      default: path.join(realpathSync(os.tmpdir()), "yapparatus-authoring-eval"),
    },
    port: { type: "string", default: "5300" },
    summarize: { type: "boolean", default: false },
  },
});

/** Run a command and return its output, failing loudly. */
function sh(command: string, args: string[], cwd: string): string {
  return execFileSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

/** The starter to test: the working tree's, or the one at a git ref, exported to `dir`. */
function exportStarter(dir: string, ref: string | undefined): string {
  if (!ref) return path.resolve("starter");
  mkdirSync(dir, { recursive: true });
  execFileSync("sh", ["-c", `git archive ${ref} starter | tar -x -C ${JSON.stringify(dir)}`]);
  return path.join(dir, "starter");
}

/** Pack this repository once, so every project installs the same Yapparatus. */
function packYapparatus(out: string): string {
  const existing = readdirSync(out).find((name) => name.endsWith(".tgz"));
  if (existing) return path.join(out, existing);
  sh("pnpm", ["pack", "--pack-destination", out], process.cwd());
  const packed = readdirSync(out).find((name) => name.endsWith(".tgz"));
  if (!packed) throw new Error("pnpm pack wrote no tarball");
  return path.join(out, packed);
}

/** Make a project from the starter, next to a copy of the subject, and install it. */
function makeWorkspace(dir: string, starter: string, tarball: string): string {
  rmSync(dir, { recursive: true, force: true });
  const project = path.join(dir, "project");
  cpSync(starter, project, { recursive: true });
  cpSync(subject, path.join(dir, "orders"), { recursive: true });
  const pkg = JSON.parse(readFileSync(path.join(project, "package.json"), "utf8"));
  pkg.dependencies.yapparatus = `file:${tarball}`;
  writeFileSync(path.join(project, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
  writeFileSync(path.join(project, "pnpm-workspace.yaml"), "allowBuilds:\n  esbuild: true\n");
  sh("pnpm", ["install", "--prefer-offline"], project);
  return project;
}

/** Start the dev server and wait until it writes its address. */
async function startServer(
  project: string,
  port: number,
): Promise<{ url: string; proc: ChildProcess }> {
  const log = openSync(path.join(project, "..", "server.log"), "w");
  const proc = spawn("pnpm", ["dev", "content", "--port", String(port)], {
    cwd: project,
    detached: true,
    env: { ...process.env, YAPPARATUS_LOG: "debug" },
    stdio: ["ignore", log, log],
  });
  const file = path.join(project, ".yapparatus", "server.json");
  for (let i = 0; i < 120 && !existsSync(file); i++) await sleep(500);
  if (!existsSync(file)) throw new Error(`dev server in ${project} did not start`);
  return { url: JSON.parse(readFileSync(file, "utf8")).url as string, proc };
}

/** Wait `ms` milliseconds. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Stop a detached process and everything it started. */
function stop(proc: ChildProcess) {
  if (proc.pid && proc.exitCode === null) {
    try {
      process.kill(-proc.pid, "SIGTERM");
    } catch {}
  }
}

/** Send the reader's message, and return the prompt a person would copy for the agent. */
async function openChat(url: string): Promise<string> {
  const sent = await fetch(`${url}/-/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ author: "reader", text: request, references: [] }),
  });
  if (!sent.ok) throw new Error(`reader message refused: ${await sent.text()}`);
  return ((await (await fetch(`${url}/-/api/chat`)).json()) as { prompt: string }).prompt;
}

/** How many reader messages the agent has replied to. */
async function replies(url: string): Promise<number> {
  const chat = (await (await fetch(`${url}/-/api/chat`)).json()) as {
    messages: { author: string }[];
  };
  return chat.messages.filter((m) => m.author === "agent").length;
}

/** The pages' text by file, from the document directory. */
function pageTexts(project: string): Map<string, string> {
  const content = path.join(project, "content");
  return new Map(
    mdxFiles(content).map((file) => [path.relative(content, file), readFileSync(file, "utf8")]),
  );
}

/** The pages that `document.json` lists, as addresses without the slash. */
function pageNames(project: string): string[] {
  const doc = JSON.parse(readFileSync(path.join(project, "content", "document.json"), "utf8"));
  return (doc.pages as string[]).map((file) => file.replace(/\.mdx$/, ""));
}

/** Send a follow-up as a reader would: select its target in the browser, write, and send. */
async function sendFollowUp(page: Page, url: string, project: string, followUp: FollowUp) {
  await page.goto(url);
  await page.evaluate(() => sessionStorage.removeItem("yapparatus:references"));
  const on = await followUp.select(page, url, project);
  if (!on) return undefined;
  await page.locator(".references > div").first().waitFor();
  await page.getByLabel("Message", { exact: true }).fill(followUp.text);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  return on;
}

/**
 * Run the agent on the prompt. After each reply, the reader sends the next follow-up from the
 * browser; after the last, the harness takes over the chat so the agent stops. Records its stream.
 */
async function runAgent(
  project: string,
  prompt: string,
  url: string,
  browser: Browser,
  model: string,
  log: string,
) {
  const agents = readFileSync(path.join(project, "AGENTS.md"), "utf8");
  const proc = spawn(
    "claude",
    [
      "-p",
      prompt,
      "--safe-mode",
      "--append-system-prompt",
      `Contents of ${path.join(project, "AGENTS.md")} (project instructions):\n\n${agents}`,
      "--model",
      model,
      "--output-format",
      "stream-json",
      "--verbose",
      "--permission-mode",
      "bypassPermissions",
      "--no-session-persistence",
    ],
    { cwd: project, detached: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  const out = createWriteStream(log);
  proc.stdout?.pipe(out);
  proc.stderr?.pipe(createWriteStream(`${log}.stderr`));
  const exited = new Promise<void>((resolve) => proc.on("exit", () => resolve()));
  const start = Date.now();
  const page = await browser.newPage();
  const results: FollowUpResult[] = [];
  let sent = { at: 0, before: new Map<string, string>(), on: "" };
  let ended: RunResult["ended"] = "timeout";
  while (Date.now() - start < limits.runMs) {
    if (proc.exitCode !== null) {
      ended = "exited";
      break;
    }
    const done = await replies(url);
    if (done > results.length) {
      const last = results.at(-1);
      if (last && !last.minutes) {
        const after = pageTexts(project);
        last.minutes = Math.round(((Date.now() - sent.at) / 60_000) * 10) / 10;
        last.changed = [...after].filter(([f, t]) => sent.before.get(f) !== t).map(([f]) => f);
        last.passed = followUps[results.length - 1]?.passed(sent.before, after, sent.on) ?? false;
      }
      const next = followUps[done - 1];
      const on = next ? await sendFollowUp(page, url, project, next).catch(() => undefined) : "";
      if (next)
        results.push({ name: next.name, ...(on ? { on } : {}), changed: [], passed: false });
      if (!next || !on) {
        ended = "replied";
        await fetch(`${url}/-/api/chat?author=reader`, {
          headers: { "Yapparatus-Agent": harnessAgent },
        });
        await Promise.race([exited, sleep(limits.stopMs)]);
        break;
      }
      sent = { at: Date.now(), before: pageTexts(project), on };
    }
    await sleep(5000);
  }
  await page.close();
  stop(proc);
  await Promise.race([exited, sleep(5000)]);
  out.end();
  return { ended, minutes: (Date.now() - start) / 60_000, followUps: results };
}

/** Show every page in a browser, so chart drawings and render errors are checked too. */
async function showPages(project: string, url: string, browser: Browser): Promise<string[]> {
  const pages = pageNames(project);
  const page = await browser.newPage();
  for (const name of pages) {
    await page.goto(`${url}/${name}`, { waitUntil: "networkidle" }).catch(() => {});
    await page.mouse.wheel(0, 100_000);
    await sleep(3000);
  }
  await page.close();
  return pages;
}

/** The document's diagnostics once every check is done. */
async function finalDiagnostics(url: string) {
  const body = (await (await fetch(`${url}/-/api/diagnostics`)).json()) as {
    diagnostics: { code: string; severity: string }[];
  };
  return body.diagnostics;
}

/** Save a picture of every diagram with an id, for a person to look at. */
function savePictures(project: string, pages: string[], dir: string) {
  for (const name of pages) {
    const file = path.join(project, "content", `${name}.mdx`);
    if (!existsSync(file)) continue;
    for (const [, id] of readFileSync(file, "utf8").matchAll(/<Diagram\b[^>]*?\bid="([^"]+)"/g)) {
      const png = path.join(dir, `${name.replaceAll("/", "_")}--${id}.png`);
      const code = `import { savePicture } from "yapparatus/agent"; await savePicture(${JSON.stringify(`/${name}#${id}`)}, ${JSON.stringify(png)});`;
      try {
        sh("node", ["--input-type=module-typescript", "-e", code], project);
      } catch {}
    }
  }
}

/** Every `.mdx` file under a directory. */
function mdxFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((name) => name.endsWith(".mdx"))
    .map((name) => path.join(dir, name));
}

/** Count each pattern's matches in a text. */
function count(patterns: Record<string, RegExp>, text: string): Record<string, number> {
  return Object.fromEntries(
    Object.entries(patterns).map(([name, pattern]) => [name, text.match(pattern)?.length ?? 0]),
  );
}

/** A tool result's text, whatever form its content takes. */
function resultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content))
    return content.map((part) => (typeof part?.text === "string" ? part.text : "")).join("\n");
  return "";
}

/** What the agent did, read from its stream: docs read, checks, pictures, calls, and tokens. */
function readTranscript(log: string) {
  const events = readFileSync(log, "utf8")
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
  const docsRead = new Set<string>();
  const calls = new Map<string, string>();
  const checks: number[] = [];
  const tokens = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 };
  const seen = new Set<string>();
  let pictures = 0;
  let refusedReplies = 0;
  let turns = 0;
  let final: typeof tokens | undefined;
  const rounds: { tools: number; checks: number[] }[] = [{ tools: 0, checks: [] }];
  let readerMessages = 0;
  let model: string | undefined;
  for (const event of events) {
    if (event.type === "system" && event.subtype === "init") model ??= event.model;
    if (event.type === "assistant") model ??= event.message?.model;
    if (event.type === "result") {
      final ??= { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 };
      final.input += event.usage.input_tokens;
      final.cacheRead += event.usage.cache_read_input_tokens;
      final.cacheWrite += event.usage.cache_creation_input_tokens;
      final.output += event.usage.output_tokens;
    }
    if (event.type === "assistant") {
      const message = event.message;
      if (!seen.has(message.id)) {
        seen.add(message.id);
        turns++;
        tokens.input += message.usage?.input_tokens ?? 0;
        tokens.cacheRead += message.usage?.cache_read_input_tokens ?? 0;
        tokens.cacheWrite += message.usage?.cache_creation_input_tokens ?? 0;
        tokens.output += message.usage?.output_tokens ?? 0;
      }
      for (const part of message.content ?? []) {
        if (part.type !== "tool_use") continue;
        const text = JSON.stringify(part.input);
        for (const [doc] of text.matchAll(/docs\/[\w./-]+\.mdx?/g)) docsRead.add(doc);
        calls.set(part.id, text);
        if (text.includes("savePicture")) pictures++;
        const round = rounds.at(-1);
        if (round) round.tools++;
      }
    }
    if (event.type === "user") {
      for (const part of event.message?.content ?? []) {
        if (part.type !== "tool_result") continue;
        const call = calls.get(part.tool_use_id) ?? "";
        const text = resultText(part.content);
        if (call.includes("checkDocument")) {
          const found = text.match(/Diagnostics \((\d+)\)/);
          checks.push(found ? Number(found[1]) : 0);
          rounds.at(-1)?.checks.push(found ? Number(found[1]) : 0);
        }
        if (text.includes("<reader_message")) readerMessages++;
        if (text.includes("<reader_message") && readerMessages > 1)
          rounds.push({ tools: 0, checks: [] });
        if (text.includes("The reply was not sent")) refusedReplies++;
      }
    }
  }
  return {
    docsRead: [...docsRead].sort(),
    checks,
    pictures,
    refusedReplies,
    turns,
    tokens: final ?? tokens,
    toolCalls: rounds.reduce((sum, round) => sum + round.tools, 0),
    rounds,
    model,
  };
}

/** One run: workspace, server, agent, and scoring. */
async function runOnce(label: string, run: number, starter: string, tarball: string, port: number) {
  const dir = path.join(path.resolve(values.out as string), `${label}-${run}`);
  const project = makeWorkspace(dir, starter, tarball);
  const { url, proc } = await startServer(project, port);
  const browser = await chromium.launch();
  try {
    const prompt = await openChat(url);
    writeFileSync(path.join(dir, "prompt.txt"), prompt);
    const log = path.join(dir, "transcript.jsonl");
    const agent = await runAgent(project, prompt, url, browser, values.model as string, log);
    const { ended, minutes } = agent;
    const pages = await showPages(project, url, browser);
    const diagnostics = await finalDiagnostics(url);
    savePictures(project, pages, dir);
    const text = mdxFiles(path.join(project, "content"))
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    const codes: Record<string, number> = {};
    for (const d of diagnostics) codes[d.code] = (codes[d.code] ?? 0) + 1;
    const result: RunResult = {
      label,
      run,
      ended,
      minutes: Math.round(minutes * 10) / 10,
      ...readTranscript(log),
      pages: pages.length,
      words: text.split(/\s+/).length,
      finalErrors: diagnostics.filter((d) => d.severity === "error").length,
      finalWarnings: diagnostics.filter((d) => d.severity === "warning").length,
      codes,
      features: count(features, text),
      violations: { ...count(violations, text), bareFence: bareFences(text) },
      followUps: agent.followUps,
    };
    writeFileSync(path.join(dir, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
    console.log(`${label}-${run}: ${ended} in ${result.minutes} min`);
    return result;
  } finally {
    await browser.close();
    stop(proc);
  }
}

/** The mean of some numbers, to one decimal. */
function mean(numbers: number[]): number {
  return numbers.length
    ? Math.round((numbers.reduce((a, b) => a + b, 0) / numbers.length) * 10) / 10
    : 0;
}

/**
 * Print a table of the mean results of each label and model, from the result files under the
 * output folder. A label run on two models is two columns, so a model change never reads as a fix.
 */
function summarize(out: string) {
  const results = readdirSync(out)
    .map((name) => path.join(out, name, "result.json"))
    .filter(existsSync)
    .map((file) => {
      const saved = JSON.parse(readFileSync(file, "utf8")) as RunResult;
      return { ...saved, ...readTranscript(path.join(path.dirname(file), "transcript.jsonl")) };
    });
  const column = (r: RunResult) => `${r.label} (${r.model?.replace(/^claude-/, "") ?? "?"})`;
  const labels = [...new Set(results.map(column))];
  const rows: [string, (r: RunResult) => number | undefined][] = [
    ["runs", () => 1],
    ["model calls", (r) => r.turns],
    ["tool calls", (r) => r.toolCalls],
    ["output tokens (k)", (r) => r.tokens.output / 1000],
    [
      "input tokens processed (k)",
      (r) => (r.tokens.input + r.tokens.cacheRead + r.tokens.cacheWrite) / 1000,
    ],
    ["minutes", (r) => r.minutes],
    ["doc pages read", (r) => r.docsRead.length],
    ["checks run", (r) => r.checks.length],
    ["diagnostics at first check", (r) => r.checks[0] ?? 0],
    ["refused replies", (r) => r.refusedReplies],
    ["pictures looked at", (r) => r.pictures],
    ["final errors", (r) => r.finalErrors],
    ["final warnings", (r) => r.finalWarnings],
    ["pages", (r) => r.pages],
    ["words", (r) => r.words],
    ...followUps.flatMap((followUp, i) => {
      const own = (r: RunResult) => r.followUps?.find((f) => f.name === followUp.name);
      const rows: [string, (r: RunResult) => number | undefined][] = [
        [`${followUp.name}: passed`, (r) => (own(r) ? Number(own(r)?.passed) : undefined)],
        [`${followUp.name}: minutes`, (r) => own(r)?.minutes],
        [
          `${followUp.name}: tool calls`,
          (r) => (own(r) ? (r.rounds[i + 1]?.tools ?? 0) : undefined),
        ],
        [`${followUp.name}: checks`, (r) => (own(r) ? r.rounds[i + 1]?.checks.length : undefined)],
      ];
      return rows;
    }),
    ...Object.keys(features).map(
      (name) =>
        [`uses ${name}`, (r: RunResult) => r.features[name] ?? 0] as [
          string,
          (r: RunResult) => number | undefined,
        ],
    ),
    ...[...Object.keys(violations), "bareFence"].map(
      (name) =>
        [`rule: ${name}`, (r: RunResult) => r.violations[name] ?? 0] as [
          string,
          (r: RunResult) => number | undefined,
        ],
    ),
  ];
  console.log(`| Metric (mean) | ${labels.join(" | ")} |`);
  console.log(`|---|${labels.map(() => "---:").join("|")}|`);
  for (const [name, value] of rows) {
    const cells = labels.map((label) => {
      const own = results.filter((r) => column(r) === label);
      const found = own.map(value).filter((v): v is number => v !== undefined);
      if (name === "runs") return String(own.length);
      return found.length ? String(mean(found)) : "–";
    });
    console.log(`| ${name} | ${cells.join(" | ")} |`);
  }
}

/** Run the label's runs in parallel, or summarize what earlier runs wrote. */
async function main() {
  const out = path.resolve(values.out as string);
  mkdirSync(out, { recursive: true });
  if (values.summarize) return summarize(out);
  const label = values.label;
  if (!label) throw new Error("Give --label, and --ref to test the starter at a git ref.");
  const starter = exportStarter(path.join(out, `starter-${label}`), values.ref);
  const tarball = packYapparatus(out);
  const runs = Number(values.runs);
  const base = Number(values.port);
  await Promise.all(
    Array.from({ length: runs }, (_, i) =>
      runOnce(label, i + 1, starter, tarball, base + i).catch((error) => {
        console.error(`${label}-${i + 1} failed:`, error);
      }),
    ),
  );
  summarize(out);
}

await main();
