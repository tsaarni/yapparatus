/** The FileTree component, which shows a folder layout written as a Markdown list. */

import * as stylex from "@stylexjs/stylex";
import { useContext } from "react";
import type { FileTreeEntry } from "../../document/page-module.ts";
import { AppIcon as Icon } from "../controls/app-icon.tsx";
import { InFigureContext } from "../prose/contexts.ts";
import { styled } from "../style/styled.ts";
import {
  fontSize,
  fontWeight,
  lineHeight,
  radius,
  sizes,
  space,
  theme,
} from "../style/theme.stylex.ts";

/**
 * A folder layout, written as a Markdown list inside `<FileTree>`. The compiler reads the list
 * into `entries`; authors write the list, never the prop.
 */
export function FileTree({ entries = [] }: { entries?: FileTreeEntry[] }) {
  const inFigure = useContext(InFigureContext);
  return (
    <div {...styled("file-tree", s.tree, inFigure && s.treeInFigure)}>
      <TreeLevel entries={entries} />
    </div>
  );
}

FileTree.breakout = true;

/** One level of the tree: its files and folders, each folder with its own level inside. */
function TreeLevel({ entries, nested }: { entries: FileTreeEntry[]; nested?: boolean }) {
  return (
    <ul {...stylex.props(s.treeLevel, nested && s.treeNested)}>
      {entries.map((entry, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: Names repeat; the list never reorders.
        <li key={index}>
          <span {...stylex.props(s.treeLine)}>
            <span {...stylex.props(s.treeIcon, entry.kind === "directory" && s.treeFolder)}>
              <Icon
                name={
                  entry.kind === "directory" ? "folder" : entry.kind === "more" ? "more" : "file"
                }
                size={15}
              />
            </span>
            <span {...stylex.props(s.treeText)}>
              {entry.kind === "more" ? (
                <span {...stylex.props(s.visuallyHidden)}>More entries</span>
              ) : (
                <span
                  {...stylex.props(
                    s.treeName,
                    entry.kind === "directory" && s.treeDirectory,
                    entry.highlight && s.treeHighlight,
                  )}
                >
                  {entry.kind === "directory" ? `${entry.name}/` : entry.name}
                </span>
              )}
              {entry.comment && <span {...stylex.props(s.treeComment)}>{entry.comment}</span>}
            </span>
          </span>
          {entry.children && <TreeLevel entries={entry.children} nested />}
        </li>
      ))}
    </ul>
  );
}

const s = stylex.create({
  /** Like a code block: at least as wide as the text, growing to fit its longest line. */
  tree: {
    justifySelf: "start",
    boxSizing: "border-box",
    width: "fit-content",
    minWidth: `min(100%, ${sizes.textWidth})`,
    maxWidth: "100%",
    marginBlock: space.xl,
    paddingBlock: space.md,
    paddingInline: space.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: theme.border,
    backgroundColor: theme.surface,
    fontFamily: theme.mono,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.relaxed,
  },
  treeInFigure: {
    marginBlock: 0,
    paddingBlock: 0,
    paddingInline: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
  },
  treeLevel: {
    margin: 0,
    padding: 0,
    listStyleType: "none",
  },
  /** A nested level indents under its folder's icon, with a guide line through its middle. */
  treeNested: {
    marginLeft: "7px",
    paddingLeft: space.lg,
    borderLeftWidth: 1,
    borderLeftStyle: "solid",
    borderLeftColor: theme.border,
  },
  treeLine: {
    display: "flex",
    alignItems: "flex-start",
    gap: space.sm,
  },
  /** The icon is centered on the first line, beside the name, however far the comment wraps. */
  treeIcon: {
    display: "inline-flex",
    flexShrink: 0,
    alignItems: "center",
    height: "1lh",
    color: theme.textMuted,
  },
  treeText: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "baseline",
    columnGap: space.sm,
    minWidth: 0,
  },
  treeFolder: {
    color: theme.accent,
  },
  treeName: {
    color: theme.textBody,
    whiteSpace: "nowrap",
  },
  treeDirectory: {
    color: theme.text,
  },
  treeHighlight: {
    color: theme.accentStrong,
    fontWeight: fontWeight.semibold,
  },
  visuallyHidden: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    clipPath: "inset(50%)",
    whiteSpace: "nowrap",
  },
  treeComment: {
    minWidth: 0,
    color: theme.textMuted,
    fontFamily: theme.sans,
    fontSize: fontSize.sm,
  },
});
