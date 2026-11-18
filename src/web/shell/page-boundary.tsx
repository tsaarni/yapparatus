import * as stylex from "@stylexjs/stylex";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { createLogger } from "../../protocol/log.ts";
import { reportDiagnostics } from "../live/client.ts";
import { fontSize, fontWeight, radius, space, theme } from "../style/theme.stylex.ts";

const log = createLogger("diagnostics");

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

const s = stylex.create({
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
