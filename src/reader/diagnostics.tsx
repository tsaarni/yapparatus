/**
 * Diagnostics the browser finds, and the header's list of all of them. The browser reports
 * what only exists when a page runs: diagram layout, render and runtime errors, and replies
 * that fail to show. The server checks the source itself and tells the agent about both.
 */

import { pages } from "virtual:yapparatus/document";
import * as stylex from "@stylexjs/stylex";
import { Component, type ErrorInfo, type ReactNode, useEffect, useRef, useState } from "react";
import { createLogger } from "../logger.ts";
import type { Diagnostic, ReportedDiagnostic } from "../protocol.ts";
import { dropDiagnosticsOnClose, reportDiagnostics } from "./api.ts";
import { AppIcon as Icon } from "./icons.tsx";
import { href, navigate } from "./router.ts";
import {
  duration,
  fontSize,
  fontWeight,
  layer,
  letterSpacing,
  lineHeight,
  radius,
  sizes,
  space,
  theme,
} from "./theme.stylex.ts";
import { Button, ui } from "./ui.tsx";

const log = createLogger("diagnostics");
const live = import.meta.env.DEV;

/**
 * Report this tab's uncaught errors, under its own scope, and clear them when a hot update starts.
 * Call once at startup in live mode.
 */
export function installGlobalReporters() {
  if (!live) return;
  const scope = `runtime:${crypto.randomUUID()}`;
  dropDiagnosticsOnClose(scope);
  const runtime: Diagnostic[] = [];
  const add = (message: string) => {
    if (!message || runtime.some((d) => d.message === message)) return;
    runtime.push({ origin: "runtime", code: "RUNTIME_FAILED", message });
    if (runtime.length > 20) runtime.shift();
    reportDiagnostics(scope, [...runtime]);
  };
  window.addEventListener("error", (event) =>
    add(`${event.message}${event.filename ? ` (${event.filename}:${event.lineno})` : ""}`),
  );
  window.addEventListener("unhandledrejection", (event) =>
    add(event.reason instanceof Error ? event.reason.message : String(event.reason)),
  );
  // A hot update replaces the code that failed. Clearing before it runs keeps the errors the
  // new code throws while it renders.
  import.meta.hot?.on("vite:beforeUpdate", () => {
    if (!runtime.length) return;
    runtime.length = 0;
    reportDiagnostics(scope, []);
  });
}

/** Report one diagram's diagnostics against the page block it sits in. */
export function useDiagramReport(
  marker: string,
  figure: string,
  diagnostics: Omit<Diagnostic, "source" | "origin">[] | undefined,
) {
  const signature = JSON.stringify(diagnostics ?? null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: The signature captures the diagnostics.
  useEffect(() => {
    if (!live || !diagnostics) return;
    const element = document.querySelector(`[data-diagram="${CSS.escape(marker)}"]`);
    const block = element?.closest<HTMLElement>("[data-source]");
    const source = block?.dataset.source;
    if (!source) return;
    reportDiagnostics(
      `diagram:${source}#${figure}`,
      diagnostics.map((d) => ({
        ...d,
        origin: "diagram",
        source,
        // The parts identify a diagram diagnostic; its message may mention a step that moves.
        ...(!d.subject && d.elements?.length ? { subject: d.elements.join(",") } : {}),
      })),
      pages.find((page) => page.source === source)?.outline.revision,
    );
  }, [marker, figure, signature]);
}

/**
 * Catches a page that fails to render, shows the error, and reports it. Each render at a new
 * revision is reported, even without errors, so the server knows the page was checked.
 * Children's effects run first, so the page's diagrams have reported by then.
 */
export class PageBoundary extends Component<
  { source: string | undefined; revision: string | undefined; children: ReactNode },
  { error?: Error | undefined }
> {
  state: { error?: Error | undefined } = {};
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  private report(error?: Error) {
    const { source, revision } = this.props;
    if (!source) return;
    reportDiagnostics(
      `render:${source}`,
      error
        ? [
            {
              origin: "render",
              code: "RENDER_FAILED",
              message: error.message,
              source,
            },
          ]
        : [],
      revision,
    );
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    log.error(`${this.props.source ?? "a page"} failed to render:`, error, info.componentStack);
    this.report(error);
  }
  componentDidMount() {
    if (!this.state.error) this.report();
  }
  componentDidUpdate(previous: { revision: string | undefined }) {
    if (previous.revision === this.props.revision) return;
    // A new revision may fix the error; render it again.
    if (this.state.error) this.setState({ error: undefined });
    else this.report();
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" {...stylex.props(s.crash)}>
        <p {...stylex.props(s.crashTitle)}>This page could not be shown.</p>
        <pre {...stylex.props(s.crashText)}>{this.state.error.message}</pre>
        <p {...stylex.props(s.crashHint)}>The agent is told about this error.</p>
      </div>
    );
  }
}

function where(diagnostic: ReportedDiagnostic) {
  const page = pages.find((p) => p.source === diagnostic.source);
  return { page, label: page?.outline.title ?? diagnostic.source ?? "Application" };
}

const counted = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * The header's indicator, shown only when the document has errors or warnings, and its list.
 * An item opens where it is; Ask attaches that place to the message box.
 */
export function DiagnosticsMenu({
  diagnostics,
  onAsk,
}: {
  diagnostics: ReportedDiagnostic[];
  onAsk?: (diagnostic: ReportedDiagnostic) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  if (!diagnostics.length) return null;
  const errors = diagnostics.filter((d) => d.severity === "error").length;
  const warnings = diagnostics.length - errors;
  const summary = [errors && counted(errors, "error"), warnings && counted(warnings, "warning")]
    .filter(Boolean)
    .join(", ");
  const groups = new Map<string, ReportedDiagnostic[]>();
  for (const diagnostic of diagnostics) {
    const key = diagnostic.source ?? "";
    groups.set(key, [...(groups.get(key) ?? []), diagnostic]);
  }
  return (
    <div ref={root} {...stylex.props(s.root)}>
      <button
        type="button"
        aria-expanded={open}
        aria-label={summary}
        onClick={() => setOpen(!open)}
        {...stylex.props(s.badge, errors ? s.badgeError : s.badgeWarning, ui.focus)}
      >
        <span {...stylex.props(s.dot, errors ? s.dotError : s.dotWarning)} />
        {summary}
      </button>
      {open && (
        <div role="dialog" aria-label="Errors and warnings" {...stylex.props(s.panel)}>
          <div {...stylex.props(s.list)}>
            {[...groups].map(([key, items]) => {
              const { page, label } = where(items[0] as ReportedDiagnostic);
              return (
                <section key={key}>
                  <h3 {...stylex.props(s.group)}>{label}</h3>
                  <ul {...stylex.props(s.items)}>
                    {items.map((diagnostic, i) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: Diagnostics have no ids.
                      <li key={i} {...stylex.props(s.row)}>
                        <button
                          type="button"
                          disabled={!page}
                          onClick={() => {
                            if (page) navigate(href(page, diagnostic.target ?? ""));
                            setOpen(false);
                          }}
                          {...stylex.props(s.item, ui.focus)}
                        >
                          <span
                            {...stylex.props(
                              s.dot,
                              diagnostic.severity === "error" ? s.dotError : s.dotWarning,
                            )}
                          />
                          <span {...stylex.props(s.itemText)}>
                            <code {...stylex.props(s.code)}>{diagnostic.code}</code>
                            {diagnostic.line ? `Line ${diagnostic.line}: ` : ""}
                            {diagnostic.message}
                          </span>
                        </button>
                        {onAsk && page && (
                          <Button
                            size="small"
                            variant="ghost"
                            aria-label={`Ask about ${diagnostic.code}`}
                            onClick={() => {
                              setOpen(false);
                              onAsk(diagnostic);
                            }}
                          >
                            <Icon name="ask" size={14} /> Ask
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const s = stylex.create({
  root: { position: "relative" },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    gap: space.sm,
    height: sizes.control,
    paddingInline: space.md,
    borderRadius: radius.full,
    borderWidth: 1,
    borderStyle: "solid",
    cursor: "pointer",
    fontFamily: theme.sans,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    transitionProperty: "border-color",
    transitionDuration: duration.fast,
  },
  badgeError: {
    borderColor: { default: theme.errorBorder, ":hover": theme.error },
    backgroundColor: theme.errorSurface,
    color: theme.error,
  },
  badgeWarning: {
    borderColor: { default: theme.warningBorder, ":hover": theme.warning },
    backgroundColor: theme.warningSurface,
    color: theme.warning,
  },
  dot: { flexShrink: 0, width: space.sm, height: space.sm, borderRadius: radius.full },
  dotError: { backgroundColor: theme.error },
  dotWarning: { backgroundColor: theme.warning },
  panel: {
    position: "absolute",
    zIndex: layer.popover,
    top: `calc(100% + ${space.sm})`,
    right: 0,
    width: `min(440px, calc(100vw - ${space.xl2}))`,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: theme.borderStrong,
    backgroundColor: theme.surfaceRaised,
    boxShadow: theme.shadowOverlay,
    overflow: "hidden",
  },
  list: {
    maxHeight: "min(420px, 60vh)",
    overflowY: "auto",
    paddingBlock: space.sm,
  },
  group: {
    margin: 0,
    paddingBlock: `${space.sm} ${space.xs}`,
    paddingInline: space.lg,
    color: theme.textMuted,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    letterSpacing: letterSpacing.caps,
    textTransform: "uppercase",
  },
  items: { margin: 0, padding: 0, listStyle: "none" },
  item: {
    display: "flex",
    alignItems: "baseline",
    gap: space.sm,
    flexGrow: 1,
    minWidth: 0,
    paddingBlock: space.sm,
    paddingInline: space.lg,
    borderWidth: 0,
    textAlign: "left",
    cursor: { default: "pointer", ":disabled": "default" },
    backgroundColor: { default: "transparent", ":hover": theme.surfaceHover },
    color: theme.textBody,
    fontFamily: theme.sans,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.normal,
  },
  itemText: { minWidth: 0 },
  code: {
    marginRight: space.sm,
    color: theme.textMuted,
    fontFamily: theme.mono,
    fontSize: fontSize.xs,
  },
  row: {
    display: "flex",
    alignItems: "baseline",
    gap: space.xs,
    paddingRight: space.sm,
  },
  crash: {
    gridColumn: "content",
    padding: space.xl,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: theme.errorBorder,
    backgroundColor: theme.errorSurface,
  },
  crashTitle: { margin: 0, color: theme.error, fontWeight: fontWeight.semibold },
  crashText: {
    marginBlock: space.md,
    whiteSpace: "pre-wrap",
    color: theme.text,
    fontFamily: theme.mono,
    fontSize: fontSize.sm,
  },
  crashHint: { margin: 0, color: theme.textMuted, fontSize: fontSize.sm },
});
