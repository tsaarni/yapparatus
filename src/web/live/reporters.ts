/**
 * Diagnostics only a running page finds, such as chart layout and runtime errors, reported to
 * the server against the page revision rendered, so a changed page never has to take one back.
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
 * counting when the page changes. Call once at startup.
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
