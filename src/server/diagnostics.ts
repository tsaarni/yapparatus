/**
 * Diagnostics: the errors and warnings in the document, for the agent first. The server finds
 * what follows from the source alone: it compiles each page and checks links and
 * `document.json` whenever a file changes. The browser reports what only exists when a page
 * runs: diagram layout, render and runtime errors, and replies that fail to show. Each page
 * also has a check state, so a page nobody has rendered since it changed is never reported
 * as clean.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { ViteDevServer } from "vite";
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
  diagnosticCodes,
  isDiagnosticCode,
  type ReportedDiagnostic,
} from "../protocol.ts";
import type { SourceFiles } from "../source-files.ts";
import { revision } from "../source-plugin.ts";
import { HttpError, isRecord, type Router } from "./http.ts";

const log = createLogger("diagnostics");

/** How long an open browser needs after a file change to render the page and report. */
const browserDelay = 1500;

const browserOrigins: DiagnosticOrigin[] = ["diagram", "render", "runtime", "reply"];

interface Entry {
  diagnostics: Diagnostic[];
  /** The file the scope checks, for scopes tied to a page. */
  source?: string;
  revision?: string;
  reportedAt: string;
}

/** The page a browser scope checks: "render:<source>" or "diagram:<source>#<figure>". */
function sourceOfScope(scope: string): string | undefined {
  return /^(?:render|diagram):([^#]+)/.exec(scope)?.[1];
}

export class DiagnosticStore {
  private scopes = new Map<string, Entry>();
  /** The revision each page was last rendered at by a browser. */
  private checked = new Map<string, string>();
  private revisions = new Map<string, { mtime: number; revision: string }>();
  private readonly startedAt = Date.now();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private lastFileChange = 0;
  private checking = false;
  private readonly root: string;
  private readonly content: string;
  private readonly server: ViteDevServer;
  private readonly files: SourceFiles;
  private readonly changed: () => void;

  constructor(options: {
    root: string;
    content: string;
    server: ViteDevServer;
    files: SourceFiles;
    changed: () => void;
  }) {
    this.root = options.root;
    this.content = options.content;
    this.server = options.server;
    this.files = options.files;
    this.changed = options.changed;
  }

  /** Current diagnostics, oldest scope first. Reports for changed files are dropped. */
  list(): ReportedDiagnostic[] {
    const out: ReportedDiagnostic[] = [];
    for (const [scope, entry] of this.scopes) {
      if (entry.revision && entry.source && this.revisionOf(entry.source) !== entry.revision) {
        log.debug(`${scope}: expired, ${entry.source} changed`);
        this.scopes.delete(scope);
        continue;
      }
      for (const diagnostic of entry.diagnostics)
        out.push({
          ...diagnostic,
          severity: diagnosticCodes[diagnostic.code].severity,
          scope,
          reportedAt: entry.reportedAt,
        });
    }
    return out;
  }

  /**
   * Pages whose diagram and render checks are out of date: a browser rendered an older
   * revision, or the file changed since the server started and no browser has rendered it.
   */
  unchecked(): string[] {
    return this.pageIds()
      .map((id) => `${this.content}/${id}.mdx`)
      .filter((source) => {
        const current = this.revisionOf(source);
        const seen = this.checked.get(source);
        if (seen) return seen !== current;
        const file = path.join(this.root, source);
        return existsSync(file) && statSync(file).mtimeMs > this.startedAt;
      });
  }

  /** A file changed: drop expired reports and check the source again shortly. */
  fileChanged() {
    this.lastFileChange = Date.now();
    const before = this.scopes.size;
    this.list();
    if (this.scopes.size !== before) this.changed();
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
    this.replace(
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
      this.replace(`compile:${source}`, issues);
    }
    const found = checkLinks(await this.outlines(), this.files.lineCount);
    for (const id of this.pageIds()) {
      const source = `${this.content}/${id}.mdx`;
      this.replace(
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
    // A removed or renamed page has no checks left to replace its scopes, so clear them here.
    const sources = new Set(this.pageIds().map((id) => `${this.content}/${id}.mdx`));
    for (const scope of [...this.scopes.keys()]) {
      const source = /^(?:compile|links):(.+)$/.exec(scope)?.[1];
      if (source && !sources.has(source)) this.replace(scope, []);
    }
  }

  replace(scope: string, diagnostics: Diagnostic[], revision?: string) {
    const source = sourceOfScope(scope);
    const rendered = !!source && !!revision && scope.startsWith("render:");
    const newlyChecked = rendered && this.checked.get(source) !== revision;
    if (rendered) this.checked.set(source, revision);
    const previous = JSON.stringify(this.scopes.get(scope)?.diagnostics ?? []);
    if (diagnostics.length === 0) this.scopes.delete(scope);
    else
      this.scopes.set(scope, {
        diagnostics,
        reportedAt: new Date().toISOString(),
        ...(source ? { source } : {}),
        ...(revision ? { revision } : {}),
      });
    if (previous === JSON.stringify(diagnostics)) {
      // A page rendered at a new revision changes the check state, even with no diagnostics.
      if (newlyChecked) this.changed();
      return;
    }
    log.info(`${scope}: ${diagnostics.length} diagnostics`);
    for (const d of diagnostics) log.debug(`${scope}: ${d.code} ${d.message}`);
    this.changed();
  }

  private revisionOf(source: string): string | undefined {
    const file = path.resolve(this.root, source);
    if (!file.startsWith(this.root) || !existsSync(file)) return;
    const mtime = statSync(file).mtimeMs;
    const cached = this.revisions.get(file);
    if (cached?.mtime === mtime) return cached.revision;
    const value = revision(readFileSync(file, "utf8"));
    this.revisions.set(file, { mtime, revision: value });
    return value;
  }

  mount(router: Router) {
    router
      .on("GET", "/diagnostics", () => ({ status: 200, body: this.list() }))
      .on("PUT", "/diagnostics/:scope*", ({ params, body }) => {
        const scope = browserScope(params.scope);
        const diagnostics = parseDiagnostics(body.diagnostics);
        const revision = typeof body.revision === "string" ? body.revision : undefined;
        this.replace(scope, diagnostics, revision);
        return { status: 204 };
      })
      .on("DELETE", "/diagnostics/:scope*", ({ params }) => {
        this.replace(browserScope(params.scope), []);
        return { status: 204 };
      });
  }
}

/** The browser may only write its own kinds of scope; server checks are the server's. */
function browserScope(scope: string | undefined): string {
  if (!scope || scope.length > 500 || !/^(diagram|render|runtime|reply):./.test(scope))
    throw new HttpError(400, "Invalid scope.");
  return scope;
}

function text(value: unknown, max: number): string | undefined {
  return typeof value === "string" ? value.slice(0, max) : undefined;
}

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
    const source = text(item.source, 500);
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
      ...(source ? { source } : {}),
      ...(line ? { line } : {}),
      ...(target ? { target } : {}),
      ...(subject ? { subject } : {}),
      ...(elements?.length ? { elements } : {}),
    };
  });
}
