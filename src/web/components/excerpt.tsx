/** The Excerpt component, which shows lines of a source file in a page. */

import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";
import { parseFileAddress } from "../../document/file-address.ts";
import { SourceFileContext } from "../prose/contexts.ts";
import { fontSize, theme } from "../style/theme.stylex.ts";

/** What an author writes on an excerpt, and the code the compiler adds. */
export interface ExcerptProps {
  /** The file, as an address without lines: "/-/files/app/main.go". */
  from: string;
  /** Text from the first line to show, which exactly one line contains. Default: the whole file. */
  start?: string;
  /** Text from the last line to show. Default: the end of the block the start line opens. */
  end?: string;
  /** Text of lines to highlight, or a list: every line of the excerpt that contains one. */
  mark?: string | string[];
  /** Wrap long lines, for a file whose words matter more than its layout, such as Markdown. */
  wrap?: boolean;
  /** The code, read from the file when the page is compiled. */
  children?: ReactNode;
}

/**
 * Lines of a source file, read when the page is compiled. They show as a code block with the
 * file's line numbers, and its bar links to the file. Inside a `Listing`, the listing titles it.
 */
export function Excerpt({ from, wrap = false, children }: ExcerptProps) {
  const file = parseFileAddress(from);
  if (!file || !children)
    return <p {...stylex.props(s.unavailable)}>The lines from {from} cannot be shown.</p>;
  const digits = String(file.lines?.end ?? 999).length;
  return (
    <SourceFileContext.Provider value={{ file, whole: false, digits, wrap }}>
      {children}
    </SourceFileContext.Provider>
  );
}
Excerpt.breakout = true;

const s = stylex.create({
  unavailable: {
    color: theme.textMuted,
    fontSize: fontSize.sm,
  },
});
