/**
 * Diagnostics the browser finds and reports to the server. The browser reports what only
 * exists when a page runs: chart layout, render and runtime errors, and replies that fail to
 * show. Each report is about the revision of the page it rendered, so it never has to take
 * anything back: a changed page has a new revision. The server checks the source, diagrams
 * included, itself and tells the agent about both.
 */

import { pages } from "virtual:yapparatus/document";
import { useEffect } from "react";
import type { Diagnostic } from "../../document/diagnostic.ts";
import { currentPage } from "../addressing/router.ts";
import { reportDiagnostics } from "./client.ts";

const live = import.meta.env.DEV;

/** The most runtime errors a tab reports for one revision of a page. */
const runtimeLimit = 20;

/**
 * Report this tab's uncaught errors against the revision of the page on screen, so they stop
 * counting when the page changes. On a source file's view they are only logged.
 * Call once at startup in live mode.
 */
export function installGlobalReporters() {
  if (!live) return;
  const reported = new Map<string, Set<string>>();
  const add = (message: string) => {
    const page = currentPage();
    if (!message || !page?.outline) return;
    const { revision } = page.outline;
    const messages = reported.get(revision) ?? new Set<string>();
    reported.set(revision, messages);
    if (messages.has(message) || messages.size >= runtimeLimit) return;
    messages.add(message);
    reportDiagnostics({
      source: page.source,
      revision,
      diagnostics: [{ origin: "runtime", code: "RUNTIME_FAILED", message }],
    });
  };
  window.addEventListener("error", (event) =>
    add(`${event.message}${event.filename ? ` (${event.filename}:${event.lineno})` : ""}`),
  );
  window.addEventListener("unhandledrejection", (event) =>
    add(event.reason instanceof Error ? event.reason.message : String(event.reason)),
  );
}

/**
 * Report what a chart found against the revision of the page it sits in. A chart with nothing
 * to report sends nothing: the page's own report says it was rendered.
 */
export function useChartReport(
  marker: string,
  chart: string,
  diagnostics: Omit<Diagnostic, "source" | "origin">[] | undefined,
) {
  const signature = JSON.stringify(diagnostics ?? null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: The signature captures the diagnostics.
  useEffect(() => {
    if (!live || !diagnostics?.length) return;
    const element = document.querySelector(`[data-diagram="${CSS.escape(marker)}"]`);
    const block = element?.closest<HTMLElement>("[data-source]");
    const page = pages.find((p) => p.source === block?.dataset.source);
    if (!page?.outline) return;
    reportDiagnostics({
      source: page.source,
      revision: page.outline.revision,
      diagnostics: diagnostics.map((d) => ({ ...d, origin: "chart" })),
    });
  }, [marker, chart, signature]);
}
