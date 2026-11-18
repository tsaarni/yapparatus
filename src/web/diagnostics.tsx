/**
 * Diagnostics the browser finds, and the header's list of all of them. The browser reports
 * what only exists when a page runs: chart layout, render and runtime errors, and replies
 * that fail to show. Each report is about the revision of the page it rendered, so it never
 * has to take anything back: a changed page has a new revision. The server checks the source,
 * diagrams included, itself and tells the agent about both.
 */

import { pages } from "virtual:yapparatus/document";
import * as stylex from "@stylexjs/stylex";
import { Component, type ErrorInfo, type ReactNode, useEffect, useRef, useState } from "react";
import type { Diagnostic } from "../document/diagnostic.ts";
import { createLogger } from "../protocol/log.ts";
import type { ReportedDiagnostic } from "../protocol/rest-api.ts";
import { reportDiagnostics } from "./api.ts";
import { AppIcon as Icon } from "./icons.tsx";
import { currentPage, href, navigate } from "./router.ts";
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
import { Button, ui, useCopy } from "./ui.tsx";

const log = createLogger("diagnostics");
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

/**
 * Catches a page that fails to render, shows the error, and reports it. Each render at a new
 * revision is reported, even without errors, so the server knows the page was checked.
 * Children's effects run first, so the page's charts have reported by then.
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
    if (!source || !revision) return;
    reportDiagnostics({
      source,
      revision,
      diagnostics: error
        ? [{ origin: "render", code: "RENDER_FAILED", message: error.message }]
        : [],
    });
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
 * An item's code and line open where it is. Its buttons copy it and attach it to the message box.
 */
export function DiagnosticsMenu({
  diagnostics,
  onComment,
}: {
  diagnostics: ReportedDiagnostic[];
  onComment?: (diagnostic: ReportedDiagnostic) => void;
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
                      <Row
                        // biome-ignore lint/suspicious/noArrayIndexKey: Diagnostics have no ids.
                        key={i}
                        diagnostic={diagnostic}
                        {...(page && {
                          onOpen: () => {
                            navigate(href(page, diagnostic.target ?? ""));
                            setOpen(false);
                          },
                        })}
                        {...(onComment &&
                          page && {
                            onComment: () => {
                              setOpen(false);
                              onComment(diagnostic);
                            },
                          })}
                      />
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

/** A diagnostic as text to paste elsewhere: its code, its file and line, and its message. */
function asText(diagnostic: ReportedDiagnostic) {
  const place = [diagnostic.source, diagnostic.line].filter(Boolean).join(":");
  return `${diagnostic.code}${place ? ` ${place}` : ""}: ${diagnostic.message}`;
}

/**
 * One diagnostic in the list. Its code and line open where it is. The message is plain text,
 * so the reader can select it, and the buttons copy it or attach it to the message box.
 */
function Row({
  diagnostic,
  onOpen,
  onComment,
}: {
  diagnostic: ReportedDiagnostic;
  onOpen?: () => void;
  onComment?: () => void;
}) {
  const [copied, copy] = useCopy();
  const copyLabel =
    copied === "copied"
      ? `${diagnostic.code} copied`
      : copied === "failed"
        ? "The clipboard is not available"
        : `Copy ${diagnostic.code}`;
  return (
    <li {...stylex.props(s.row)}>
      <span {...stylex.props(s.dot, diagnostic.severity === "error" ? s.dotError : s.dotWarning)} />
      <span {...stylex.props(s.itemText)}>
        <button
          type="button"
          disabled={!onOpen}
          onClick={onOpen}
          {...stylex.props(s.place, ui.focus)}
        >
          <code {...stylex.props(s.code)}>{diagnostic.code}</code>
          {diagnostic.line ? `Line ${diagnostic.line}` : ""}
        </button>
        {diagnostic.message}
      </span>
      <span {...stylex.props(s.actions)}>
        <Button
          variant="icon"
          size="small"
          aria-label={copyLabel}
          title={copied === "idle" ? "Copy" : copyLabel}
          onClick={() => void copy(asText(diagnostic))}
        >
          <Icon name={copied === "copied" ? "check" : "copy"} size={14} />
        </Button>
        {onComment && (
          <Button
            variant="icon"
            size="small"
            aria-label={`Comment on ${diagnostic.code}`}
            title="Comment"
            onClick={onComment}
          >
            <Icon name="comment" size={14} />
          </Button>
        )}
      </span>
    </li>
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
  row: {
    display: "flex",
    alignItems: "baseline",
    gap: space.sm,
    paddingBlock: space.sm,
    paddingLeft: space.lg,
    paddingRight: space.sm,
    backgroundColor: { default: "transparent", ":hover": theme.surfaceHover },
    color: theme.textBody,
    fontFamily: theme.sans,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.normal,
  },
  // A path or an address has no spaces, so it breaks anywhere and stays out of the buttons.
  itemText: { flexGrow: 1, minWidth: 0, overflowWrap: "anywhere", userSelect: "text" },
  place: {
    marginRight: space.sm,
    padding: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    cursor: { default: "pointer", ":disabled": "default" },
    color: { default: theme.textMuted, ":hover": theme.text },
    fontFamily: theme.sans,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.normal,
    textAlign: "left",
    textDecorationLine: { default: "none", ":hover": "underline" },
  },
  code: {
    marginRight: space.sm,
    fontFamily: theme.mono,
    fontSize: fontSize.xs,
  },
  // The buttons sit on the first line whatever its height, and never shrink.
  actions: { display: "flex", flexShrink: 0, alignSelf: "start" },
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
