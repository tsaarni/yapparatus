/**
 * The diagnostics resource: GET answers with every diagnostic and the unchecked pages once
 * recent edits are checked; POST adds what a browser found in a page or a reply.
 */
import {
  type Diagnostic,
  type DiagnosticOrigin,
  isDiagnosticCode,
} from "../../document/diagnostic.ts";
import type { DocumentDiagnostics } from "../../protocol/rest-api.ts";
import type { DiagnosticStore } from "../diagnostic-store.ts";
import { diagnosticsSection } from "../prompt.ts";
import { HttpError, isRecord, type Router } from "../router.ts";

const browserOrigins: DiagnosticOrigin[] = ["chart", "render", "runtime", "reply"];

/** Serves `/-/api/diagnostics` from the diagnostic store. */
export class DiagnosticsResource {
  private readonly store: DiagnosticStore;

  constructor(store: DiagnosticStore) {
    this.store = store;
  }

  mount(router: Router) {
    router
      .on("GET", "/diagnostics", async () => ({ status: 200, body: await this.document() }))
      .on("POST", "/diagnostics", ({ body }) => {
        this.report(body);
        return { status: 204 };
      });
  }

  /** Every diagnostic and the unchecked pages, once recent edits are checked, with agent text. */
  private async document(): Promise<DocumentDiagnostics> {
    const { store } = this;
    await store.settle();
    const diagnostics = store.list();
    store.give(diagnostics.filter((d) => d.severity === "error"));
    const unchecked = store.unchecked();
    return {
      diagnostics,
      unchecked,
      prompt: diagnosticsSection(diagnostics, () => false, unchecked),
    };
  }

  /** A browser's report on one revision of a page, or on a reply, which has no revision. */
  private report(input: Record<string, unknown>) {
    const source = typeof input.source === "string" ? input.source : "";
    const revision = typeof input.revision === "string" ? input.revision : undefined;
    const kind = this.store.kindOf(source);
    if (!kind)
      throw new HttpError(400, "source must be a page of the document or a reply in the chat.");
    if ((kind === "reply") === (revision !== undefined))
      throw new HttpError(400, "A page's report needs its revision; a reply's has none.");
    this.store.report(source, revision, parseDiagnostics(input.diagnostics));
  }
}

/** A string field cut to `max` characters, or undefined when it is not a string. */
function text(value: unknown, max: number): string | undefined {
  return typeof value === "string" ? value.slice(0, max) : undefined;
}

/** A browser's diagnostics: browser origins, codes from `diagnosticCodes`, and no source. */
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
