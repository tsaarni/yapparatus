/**
 * A figure's diagnostics, listed under it while editing. Charts use it too.
 */
import * as stylex from "@stylexjs/stylex";
import { type DiagnosticCode, diagnosticCodes } from "../protocol.ts";
import { fontSize, fontWeight, lineHeight, radius, space, theme } from "../reader/theme.stylex.ts";
import type { Diagnostic } from "./scene.ts";

/** A figure's diagnostics under it, open while there are errors. Charts show theirs here too. */
export function Diagnostics({
  items,
  of = "diagram",
}: {
  items: Pick<Diagnostic, "code" | "message">[];
  of?: "diagram" | "chart";
}) {
  const isError = (d: { code: DiagnosticCode }) => diagnosticCodes[d.code].severity === "error";
  const errors = items.filter(isError).length;
  const warnings = items.length - errors;
  const count = (n: number, word: string) => (n ? `${n} ${word}${n === 1 ? "" : "s"}` : "");
  return (
    <details open={errors > 0} {...stylex.props(styles.diagnostics)}>
      <summary {...stylex.props(styles.summary, errors ? styles.summaryError : null)}>
        {[count(errors, "error"), count(warnings, "warning")].filter(Boolean).join(", ")} in this{" "}
        {of}
      </summary>
      <ul
        aria-label={of === "chart" ? "Chart diagnostics" : "Diagram diagnostics"}
        {...stylex.props(styles.list)}
      >
        {items.map((d, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: Diagnostics can repeat.
          <li key={i} {...stylex.props(styles.item, isError(d) && styles.itemError)}>
            <code {...stylex.props(styles.code)}>{d.code}</code> {d.message}
          </li>
        ))}
      </ul>
    </details>
  );
}

const styles = stylex.create({
  diagnostics: {
    marginTop: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: theme.border,
    backgroundColor: theme.canvas,
  },
  summary: {
    paddingBlock: space.sm,
    paddingInline: space.md,
    color: theme.warning,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    cursor: "pointer",
  },
  summaryError: { color: theme.error },
  list: {
    display: "grid",
    gap: space.xs,
    margin: 0,
    paddingBlock: `0 ${space.md}`,
    paddingInline: space.md,
    listStyle: "none",
  },
  item: {
    color: theme.textBody,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.normal,
  },
  itemError: { color: theme.error },
  code: {
    color: theme.warning,
    fontFamily: theme.mono,
    fontSize: fontSize.xs,
  },
});
