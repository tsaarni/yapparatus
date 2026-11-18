/** Tables written in Markdown, which grow into the wide track and scroll beyond it. */

import * as stylex from "@stylexjs/stylex";
import type { HTMLAttributes, ThHTMLAttributes } from "react";
import { focus } from "../style/focus.ts";
import { fontSize, fontWeight, lineHeight, sizes, space, theme } from "../style/theme.stylex.ts";

/**
 * Tables, like figures, are at least as wide as the text column and grow to the right
 * into the wide track as far as their content needs. Beyond that they scroll.
 */
export function DataTable(props: HTMLAttributes<HTMLTableElement>) {
  return (
    // biome-ignore lint/a11y/noNoninteractiveTabindex: Wide tables must be keyboard scrollable.
    <div tabIndex={0} {...stylex.props(s.tableScroll, focus.ring)}>
      <table {...props} {...stylex.props(s.table)} />
    </div>
  );
}
DataTable.breakout = true;

/** A table cell. Its content keeps a reading measure. */
export function DataCell({ children, ...props }: HTMLAttributes<HTMLTableCellElement>) {
  return (
    <td {...props} {...stylex.props(s.cell)}>
      <div {...stylex.props(s.cellMeasure)}>{children}</div>
    </td>
  );
}

/** A table header cell. */
export function HeaderCell(props: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th {...props} {...stylex.props(s.cell, s.th)} />;
}

const s = stylex.create({
  tableScroll: {
    justifySelf: "start",
    boxSizing: "border-box",
    width: "fit-content",
    minWidth: `min(100%, ${sizes.textWidth})`,
    maxWidth: "100%",
    marginBlock: space.xl,
    overflowX: "auto",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: fontSize.sm,
    lineHeight: lineHeight.normal,
    fontVariantNumeric: "tabular-nums",
  },
  /** Browsers ignore max-width on table cells, so the measure lives on the content. */
  cellMeasure: {
    maxWidth: "48ch",
  },
  cell: {
    paddingBlock: space.sm,
    paddingInline: `0 ${space.xl}`,
    textAlign: "left",
    verticalAlign: "top",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: theme.border,
  },
  th: {
    color: theme.textMuted,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    whiteSpace: "nowrap",
    borderBottomColor: theme.borderStrong,
  },
});
