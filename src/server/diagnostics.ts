/**
 * Diagnostics: the errors and warnings in the document, for the agent first. The server finds
 * what follows from the source alone: it compiles each page and checks links and
 * `document.json` whenever a file changes. A browser reports what only exists when a page
 * runs: diagram layout, render and runtime errors, and replies that fail to show. Its findings
 * belong to the revision of the page it rendered and only add: a changed page has a new
 * revision, and the findings of the old one stop counting. A page no browser has rendered
 * since it changed is unchecked, and is never reported as clean.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { ViteDevServer } from "vite";
import { excerptFiles } from "../code-plugin.ts";
import {
  checkIcons,
  checkLinks,
  checkPages,
  checkTheme,
  type PageOutline,
  pageIdOf,
} from "../document.ts";
import { checkFiles } from "../files.ts";
import { createLogger } from "../logger.ts";
import { contentIssues } from "../markdown-plugin.ts";
import { compiled } from "../outline-plugin.ts";
import {
  type Diagnostic,
  type DiagnosticOrigin,
  type DocumentDiagnostics,
  diagnosticCodes,
  isDiagnosticCode,
  type ReportedDiagnostic,
  type UncheckedPage,
} from "../protocol.ts";
import type { SourceFiles } from "../source-files.ts";
import { pageRevision } from "../source-plugin.ts";
import { HttpError, isRecord, type Router } from "./http.ts";
import { diagnosticsSection } from "./prompt.ts";

const log = createLogger("diagnostics");

/** How long an open browser needs after a file change to render the page and report. */
const browserDelay = 1500;
/**
 * How long an error must stay before it can wake the agent. Saving a file
 * half-written, or an edit across two files, shows errors that are gone a moment later.
 */
const settleTime = 2000;
/** The longest a read waits for the checks of recent edits. */
const settleLimit = 8000;
/** Revisions of a page whose findings are kept: the current one, and those before it. */
const keptRevisions = 3;

const browserOrigins: DiagnosticOrigin[] = ["diagram", "render", "runtime", "reply"];

/** What identifies a diagnostic across renders, line shifts, and rewording. */
export function diagnosticKey(d: Diagnostic): string {
  return [d.code, d.source ?? "", d.target ?? "", d.subject ?? d.message].join("|");
}

export interface DiagnosticOptions {
  root: string;
  content: string;
  server: ViteDevServer;
  files: SourceFiles;
  /** The module files of the replies in the chat, from the project folder. */
  replies: () => Set<string>;
  changed: () => void;
}

export class DiagnosticStore {
  /** The server's own checks, each replaced as a whole: "pages", "compile:<source>", "links:<source>". */
  private checks = new Map<string, Diagnostic[]>();
  /** What browsers found on each page, by revision, oldest revision first, by `diagnosticKey`. */
  private findings = new Map<string, Map<string, Map<string, Diagnostic>>>();
  /** What browsers found in each reply, by its module file. */
  private replyFindings = new Map<string, Map<string, Diagnostic>>();
  private revisions = new Map<string, { stamp: string; revision: string }>();
  /** Open errors that have stayed for the settle time, by `diagnosticKey`, with their file. */
  private settledErrors = new Map<string, string>();
  /** Errors not settled yet, by `diagnosticKey`, with when they appeared. */
  private appearing = new Map<string, number>();
  /** Errors the agent has been given, by `diagnosticKey`, with their file. */
  private given = new Map<string, string>();
  private settleTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly startedAt = Date.now();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private lastFileChange = 0;
  private checking = false;
  private readonly options: DiagnosticOptions;
  private readonly root: string;
  private readonly content: string;
  private readonly server: ViteDevServer;

  constructor(options: DiagnosticOptions) {
    this.options = options;
    this.root = options.root;
    this.content = options.content;
    this.server = options.server;
  }

  /**
   * Current diagnostics: the server's checks, what browsers found at each page's current
   * revision, and what they found in the replies still in the chat.
   */
  list(): ReportedDiagnostic[] {
    const found: Diagnostic[] = [...this.checks.values()].flat();
    for (const source of this.pageSources()) {
      const current = this.revisionOf(source);
      found.push(...(current ? (this.findings.get(source)?.get(current)?.values() ?? []) : []));
    }
    const replies = this.options.replies();
    for (const [source, items] of this.replyFindings)
      if (replies.has(source)) found.push(...items.values());
      else this.replyFindings.delete(source);
    return found.map((d) => this.reported(d));
  }

  /** A diagnostic with its severity, and where it is in the page now. */
  private reported(d: Diagnostic): ReportedDiagnostic {
    const page = d.source ? this.addressOf(d.source) : undefined;
    const place =
      d.source && d.target && d.line === undefined
        ? compiled.get(path.join(this.root, d.source))?.places[d.target]
        : undefined;
    return {
      ...d,
      severity: diagnosticCodes[d.code].severity,
      ...(place ? { line: place.start, endLine: place.end } : {}),
      ...(page ? { address: d.target && d.origin !== "reply" ? `${page}#${d.target}` : page } : {}),
    };
  }

  /** Settled errors that the agent has not been given. */
  newErrors(): ReportedDiagnostic[] {
    return this.list().filter((d) => {
      const key = diagnosticKey(d);
      return d.severity === "error" && this.settledErrors.has(key) && !this.given.has(key);
    });
  }

  /** Remember that the agent has been given these diagnostics. */
  give(diagnostics: Diagnostic[]) {
    for (const d of diagnostics) this.given.set(diagnosticKey(d), d.source ?? "");
  }

  /** "content/a/b.mdx" → "/a/b", for a page of the document. */
  private addressOf(source: string): string | undefined {
    const prefix = `${this.content}/`;
    if (!source.startsWith(prefix) || !source.endsWith(".mdx")) return undefined;
    return `/${source.slice(prefix.length, -".mdx".length)}`;
  }

  /**
   * Pages whose diagram and render checks are out of date: no browser has rendered their
   * current revision, though one rendered an earlier one or the page changed since the
   * server started. Each comes with what was found in the revision last rendered.
   */
  unchecked(): UncheckedPage[] {
    const pages: UncheckedPage[] = [];
    for (const source of this.pageSources()) {
      const current = this.revisionOf(source);
      const reports = this.findings.get(source);
      if (!current || reports?.has(current)) continue;
      const last = [...(reports?.values() ?? [])].at(-1);
      if (!last && this.changedAt(source) <= this.startedAt) continue;
      pages.push({
        source,
        address: this.addressOf(source) ?? `/${source}`,
        previous: [...(last?.values() ?? [])].map((d) => this.reported(d)),
      });
    }
    return pages;
  }

  /** When the page or a file it reads last changed on disk. */
  private changedAt(source: string): number {
    const file = path.join(this.root, source);
    return Math.max(
      0,
      ...[file, ...(excerptFiles.get(file) ?? [])]
        .filter((f) => existsSync(f))
        .map((f) => statSync(f).mtimeMs),
    );
  }

  /** A file changed: the lists may differ, and the source is checked again shortly. */
  fileChanged() {
    this.lastFileChange = Date.now();
    this.settleErrors();
    this.options.changed();
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.checkSources();
    }, 150);
  }

  /**
   * Whether the checks for the latest file changes are done: the server's own checks have run,
   * and an open browser has had time to render the changed pages and report.
   */
  settled(): boolean {
    return !this.timer && !this.checking && Date.now() - this.lastFileChange > browserDelay;
  }

  /** Wait until the checks of recent edits are done, for at most a few seconds. */
  async settle() {
    const until = Date.now() + settleLimit;
    while (Date.now() < until && !this.settled())
      await new Promise((resolve) => setTimeout(resolve, 200));
  }

  /**
   * Settle the errors that have stayed for the settle time, and forget the fixed ones: gone,
   * and their page checked again. A settled error that the agent has not been given ends its
   * wait; the settle time keeps a half-saved file from doing that. A page not checked since it
   * changed keeps its errors, so a re-render does not make them new. A fixed error is no longer
   * given, so it is new again if it comes back.
   */
  private settleErrors(): boolean {
    const now = Date.now();
    const errors = new Map(
      this.list()
        .filter((d) => d.severity === "error")
        .map((d) => [diagnosticKey(d), d]),
    );
    const unchecked = new Set(this.unchecked().map((page) => page.source));
    for (const known of [this.settledErrors, this.given])
      for (const [key, source] of known)
        if (!errors.has(key) && !unchecked.has(source)) known.delete(key);
    for (const key of this.appearing.keys()) if (!errors.has(key)) this.appearing.delete(key);
    let added = false;
    let soonest = Number.POSITIVE_INFINITY;
    for (const [key, error] of errors) {
      if (this.settledErrors.has(key)) continue;
      const since = this.appearing.get(key) ?? now;
      if (now - since >= settleTime) {
        this.appearing.delete(key);
        this.settledErrors.set(key, error.source ?? "");
        added = true;
      } else {
        this.appearing.set(key, since);
        soonest = Math.min(soonest, since + settleTime);
      }
    }
    clearTimeout(this.settleTimer);
    if (Number.isFinite(soonest))
      this.settleTimer = setTimeout(
        () => {
          if (this.settleErrors()) this.options.changed();
        },
        soonest - now + 10,
      );
    return added;
  }

  /** Every diagnostic and the unchecked pages, once recent edits are checked, with text for the agent. */
  async document(): Promise<DocumentDiagnostics> {
    await this.settle();
    const diagnostics = this.list();
    this.give(diagnostics.filter((d) => d.severity === "error"));
    const unchecked = this.unchecked();
    return {
      diagnostics,
      unchecked,
      prompt: diagnosticsSection(diagnostics, () => false, unchecked),
    };
  }

  /** The pages in the content folder, as files from the project folder. */
  private pageSources(): string[] {
    return this.pageIds().map((id) => `${this.content}/${id}.mdx`);
  }

  /** Page ids from the content folder, as `document.json` should list them. */
  private pageIds(): string[] {
    const dir = path.join(this.root, this.content);
    if (!existsSync(dir)) return [];
    return (readdirSync(dir, { recursive: true }) as string[])
      .filter((file) => file.endsWith(".mdx"))
      .map((file) =>
        file
          .split(path.sep)
          .join("/")
          .replace(/\.mdx$/, ""),
      )
      .sort();
  }

  /** Outlines of the pages `document.json` lists, compiled by the same pipeline as in the browser. */
  async outlines(): Promise<Array<{ id: string; outline: PageOutline }>> {
    const { listed } = this.settings();
    const pages: Array<{ id: string; outline: PageOutline }> = [];
    for (const id of Array.isArray(listed) ? (listed as string[]).map(pageIdOf) : []) {
      await this.compile(`/${this.content}/${id}.mdx`).catch(() => undefined);
      const entry = compiled.get(path.join(this.root, this.content, `${id}.mdx`));
      if (entry) pages.push({ id, outline: entry.outline });
    }
    return pages;
  }

  /**
   * Compile a page with the same plugins as the browser, in the server's own environment.
   * The browser environment's dependency optimizer must not see these requests: at startup
   * they hold back the first page load.
   */
  private compile(url: string) {
    return this.server.environments.ssr.transformRequest(url);
  }

  private settings(): {
    listed: unknown;
    theme?: unknown;
    files?: unknown;
    logo?: unknown;
    favicon?: unknown;
    error?: string;
  } {
    try {
      const file = path.join(this.root, this.content, "document.json");
      const { pages, theme, files, logo, favicon } = JSON.parse(
        readFileSync(file, "utf8"),
      ) as Record<string, unknown>;
      return { listed: pages, theme, files, logo, favicon };
    } catch (error) {
      return { listed: undefined, error: (error as Error).message };
    }
  }

  /** Compile every page, and check links and `document.json`. Runs after each file change. */
  async checkSources() {
    this.checking = true;
    try {
      await this.runChecks();
    } finally {
      this.checking = false;
    }
  }

  private async runChecks() {
    const settingsSource = `${this.content}/document.json`;
    const { listed, theme, files, logo, favicon, error } = this.settings();
    const pageErrors = error
      ? [error]
      : [
          ...checkPages(this.pageIds(), listed),
          ...checkTheme(theme),
          ...checkFiles(files),
          ...checkIcons({ logo, favicon }),
        ];
    this.setCheck(
      "pages",
      pageErrors.map((message) => ({
        origin: "pages",
        code: "PAGE_LIST",
        subject: message,
        message,
        source: settingsSource,
      })),
    );
    for (const id of this.pageIds()) {
      const source = `${this.content}/${id}.mdx`;
      let failure: Diagnostic | undefined;
      try {
        await this.compile(`/${source}`);
      } catch (cause) {
        const { message, loc } = cause as { message: string; loc?: { line: number } };
        failure = {
          origin: "compile",
          code: "COMPILE_FAILED",
          message: message.split("\n")[0] ?? message,
          source,
          ...(loc?.line ? { line: loc.line } : {}),
        };
      }
      const issues = failure
        ? [failure]
        : (contentIssues.get(path.join(this.root, source)) ?? []).map(
            (issue): Diagnostic => ({
              origin: "compile",
              code: issue.code,
              ...(issue.subject ? { subject: issue.subject } : {}),
              message: issue.message,
              source,
              line: issue.line,
            }),
          );
      this.setCheck(`compile:${source}`, issues);
    }
    const found = checkLinks(await this.outlines(), this.options.files.lineCount);
    for (const id of this.pageIds()) {
      const source = `${this.content}/${id}.mdx`;
      this.setCheck(
        `links:${source}`,
        found
          .filter((link) => link.page === id)
          .map((link) => ({
            origin: "link",
            code: link.code,
            subject: link.subject,
            message: link.message,
            source,
            line: link.line,
          })),
      );
    }
    // A removed or renamed page has no checks left to replace its own, so clear them here.
    const sources = new Set(this.pageSources());
    for (const key of [...this.checks.keys()]) {
      const source = /^(?:compile|links):(.+)$/.exec(key)?.[1];
      if (source && !sources.has(source)) this.setCheck(key, []);
    }
    for (const source of this.findings.keys())
      if (!sources.has(source)) this.findings.delete(source);
  }

  /** Replace the result of one of the server's checks. */
  private setCheck(key: string, diagnostics: Diagnostic[]) {
    const previous = JSON.stringify(this.checks.get(key) ?? []);
    if (diagnostics.length === 0) this.checks.delete(key);
    else this.checks.set(key, diagnostics);
    if (previous === JSON.stringify(diagnostics)) return;
    log.info(`${key}: ${diagnostics.length} diagnostics`);
    for (const d of diagnostics) log.debug(`${key}: ${d.code} ${d.message}`);
    this.settleErrors();
    this.options.changed();
  }

  /**
   * Add what a browser found in one revision of a page, or in a reply. Findings only add; a
   * report without any still records that the revision was rendered.
   */
  report(input: Record<string, unknown>) {
    const source = typeof input.source === "string" ? input.source : "";
    const revision = typeof input.revision === "string" ? input.revision : undefined;
    const reply = this.options.replies().has(source);
    if (!reply && !this.pageSources().includes(source))
      throw new HttpError(400, "source must be a page of the document or a reply in the chat.");
    if (reply === (revision !== undefined))
      throw new HttpError(400, "A page's report needs its revision; a reply's has none.");
    const diagnostics = parseDiagnostics(input.diagnostics).map(
      (d): Diagnostic => (reply ? d : { ...d, source }),
    );
    let items: Map<string, Diagnostic>;
    let added = false;
    if (reply) {
      items = this.replyFindings.get(source) ?? new Map();
      this.replyFindings.set(source, items);
    } else {
      const revisions = this.findings.get(source) ?? new Map<string, Map<string, Diagnostic>>();
      this.findings.set(source, revisions);
      const known = revisions.get(revision as string);
      // The revision rendered last goes last, so it is the one shown as before a change.
      revisions.delete(revision as string);
      items = known ?? new Map();
      revisions.set(revision as string, items);
      added = !known;
      for (const old of [...revisions.keys()].slice(0, -keptRevisions)) revisions.delete(old);
    }
    for (const d of diagnostics) {
      const key = diagnosticKey(d);
      if (items.has(key)) continue;
      items.set(key, d);
      added = true;
      log.debug(`${source}: ${d.code} ${d.message}`);
    }
    if (!added) return;
    log.info(
      `${source}: ${diagnostics.length} found${revision ? ` at ${revision.slice(0, 8)}` : ""}`,
    );
    this.settleErrors();
    this.options.changed();
  }

  /** The revision of a page as it is on disk now: its text and the files it reads. */
  private revisionOf(source: string): string | undefined {
    const file = path.join(this.root, source);
    if (!existsSync(file)) return;
    const files = [...(excerptFiles.get(file) ?? [])];
    const stamp = [file, ...files].map((f) => (existsSync(f) ? statSync(f).mtimeMs : 0)).join(",");
    const cached = this.revisions.get(file);
    if (cached?.stamp === stamp) return cached.revision;
    const value = pageRevision(readFileSync(file, "utf8"), files);
    this.revisions.set(file, { stamp, revision: value });
    return value;
  }

  mount(router: Router) {
    router
      .on("GET", "/diagnostics", async () => ({ status: 200, body: await this.document() }))
      .on("POST", "/diagnostics", ({ body }) => {
        this.report(body);
        return { status: 204 };
      });
  }
}

function text(value: unknown, max: number): string | undefined {
  return typeof value === "string" ? value.slice(0, max) : undefined;
}

/** A browser's diagnostics: its own origins, codes from the registry, and no source of their own. */
function parseDiagnostics(input: unknown): Diagnostic[] {
  if (!Array.isArray(input) || input.length > 200)
    throw new HttpError(400, "diagnostics must be a list of at most 200 items.");
  return input.map((item): Diagnostic => {
    if (!isRecord(item)) throw new HttpError(400, "Each diagnostic must be an object.");
    const origin = item.origin as DiagnosticOrigin;
    const code = text(item.code, 80);
    const message = text(item.message, 4000);
    if (!browserOrigins.includes(origin))
      throw new HttpError(400, "A diagnostic needs a known origin.");
    if (!code || !message) throw new HttpError(400, "A diagnostic needs a code and a message.");
    if (!isDiagnosticCode(code))
      throw new HttpError(
        400,
        `Unknown diagnostic code ${code}. The codes are in diagnosticCodes.`,
      );
    const target = text(item.target, 200);
    const subject = text(item.subject, 500);
    const line = Number.isInteger(item.line) ? Number(item.line) : undefined;
    const elements = Array.isArray(item.elements)
      ? item.elements.filter((e): e is string => typeof e === "string").slice(0, 20)
      : undefined;
    return {
      origin,
      code,
      message,
      ...(line ? { line } : {}),
      ...(target ? { target } : {}),
      ...(subject ? { subject } : {}),
      ...(elements?.length ? { elements } : {}),
    };
  });
}
