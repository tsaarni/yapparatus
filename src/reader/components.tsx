import * as stylex from "@stylexjs/stylex";
import { type HTMLAttributes, type ReactNode, useContext } from "react";
import { partSeparator } from "../document.ts";
import { parseFileAddress } from "../files.ts";
import { createLogger } from "../logger.ts";
import type { FileTreeEntry } from "../markdown-plugin.ts";
import { AppIcon as Icon } from "./icons.tsx";
import { blockLabel, findTarget, usePage } from "./numbering.ts";
import {
  InFigureContext,
  InTargetContext,
  ReadingContext,
  SourceFileContext,
  useScopedId,
} from "./prose.tsx";
import { href } from "./router.ts";
import { TargetActions, targetHost, targetProps } from "./targets.tsx";
import {
  fontSize,
  fontWeight,
  lineHeight,
  radius,
  sizes,
  space,
  theme,
  when,
} from "./theme.stylex.ts";
import { styled, ui } from "./ui.tsx";

const log = createLogger("components");

export interface FigureProps extends HTMLAttributes<HTMLElement> {
  caption?: string;
  description?: string;
  /** The figure takes the whole width, as when it holds columns. The compiler sets it; authors never write it. */
  wide?: boolean;
  children: ReactNode;
}

/**
 * A framed figure. It is at least as wide as the text column and grows into the wide
 * track to fit its content, so large drawings keep their natural size.
 */
export function Figure(props: FigureProps) {
  return <FigureFrame {...props} />;
}
Figure.breakout = true;

/** A figure with an optional footer under its caption, such as a diagram's step controls. */
export function FigureFrame({
  caption,
  description,
  children,
  id,
  footer,
  wide,
  ...props
}: FigureProps & { footer?: ReactNode }) {
  const { reply } = useContext(ReadingContext);
  const inFigure = useContext(InFigureContext);
  const page = usePage();
  const domId = useScopedId(id);
  const label = reply ? undefined : blockLabel("figure", page, id);
  const titled = !!(caption || label);
  const actions = reply ? null : (
    <TargetActions
      name={label ?? caption ?? "this figure"}
      linkable={!!id}
      placement={titled ? "inline" : "corner"}
    />
  );
  // A diagram or chart inside a figure, such as one panel of a comparison: the enclosing
  // figure draws the frame and the caption.
  if (inFigure)
    return (
      <div {...styled(`figure-part ${props.className ?? ""}`, s.figurePart)}>
        {children}
        {footer}
      </div>
    );
  return (
    <figure
      id={domId}
      {...props}
      {...targetProps("figure", label, caption)}
      {...styled(
        `figure ${props.className ?? ""}`,
        s.figure,
        wide && s.figureWide,
        reply && s.figureInReply,
        ...targetHost,
      )}
    >
      {/* Without a caption, the actions have no row of their own and float in the corner. */}
      {!titled && actions}
      <section
        {...styled("figure-scroll", s.scroll, ui.focus)}
        aria-label={description ?? caption ?? "Figure"}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: Horizontal figure overflow must be keyboard scrollable.
        tabIndex={0}
      >
        <InFigureContext.Provider value={true}>{children}</InFigureContext.Provider>
      </section>
      {titled ? (
        // The actions sit at the end of the caption line, never over the drawing. The footer
        // belongs to the caption too: a figcaption must be the figure's last child.
        <figcaption {...stylex.props(s.caption)}>
          <div {...stylex.props(s.captionLine)}>
            <span {...stylex.props(s.captionText)}>
              {label && <span {...stylex.props(s.label)}>{label} </span>}
              {caption}
            </span>
            {actions && <span {...stylex.props(s.captionActions)}>{actions}</span>}
          </div>
          {footer}
        </figcaption>
      ) : (
        footer
      )}
    </figure>
  );
}

interface TitledProps {
  /** Anchor and reference id. With a caption, the block is numbered. */
  id?: string;
  /** The title, shown above the content. */
  caption?: string;
  /** The block takes the whole width, as when it holds columns. The compiler sets it. */
  wide?: boolean;
  children: ReactNode;
}

/**
 * A titled table: wrap a Markdown table. The title goes above the table, as in print.
 *
 *   <Table id="routes" caption="The API routes.">
 *
 *   | Route | Meaning |
 *   |---|---|
 *
 *   </Table>
 */
export function Table(props: TitledProps) {
  return <Titled kind="table" {...props} />;
}
Table.breakout = true;

/** A titled code listing: wrap a fenced code block. The title goes above the code. */
export function Listing(props: TitledProps) {
  return <Titled kind="listing" {...props} />;
}
Listing.breakout = true;

function Titled({
  kind,
  id,
  caption,
  wide,
  children,
}: TitledProps & { kind: "table" | "listing" }) {
  const { reply } = useContext(ReadingContext);
  const page = usePage();
  const domId = useScopedId(id);
  const label = reply ? undefined : blockLabel(kind, page, id);
  return (
    <figure
      {...(domId ? { id: domId } : {})}
      {...targetProps(kind, label, caption)}
      {...styled(`titled-${kind}`, s.titled, wide && s.figureWide, ...targetHost)}
      {...(caption ? { "aria-label": label ? `${label}. ${caption}` : caption } : {})}
    >
      {(caption || label) && (
        <figcaption {...stylex.props(s.title)}>
          {label && <span {...stylex.props(s.label)}>{label} </span>}
          {caption}
          {!reply && (
            <TargetActions
              name={label ?? caption ?? `this ${kind}`}
              placement="inline"
              linkable={!!id}
            />
          )}
        </figcaption>
      )}
      <InTargetContext.Provider value={true}>{children}</InTargetContext.Provider>
    </figure>
  );
}

export interface RefProps {
  /**
   * A figure, table, or listing id, a heading id on this page, or an address on any page:
   * "/page" or "/page#id". `figure--part` points at a diagram part or step; it opens that step.
   */
  to: string;
  /** Link text. Default: "Figure 3.1", "Section 3.2", "Chapter 3", or the caption, heading, or title. */
  children?: ReactNode;
}

/** A cross-reference that stays correct when figures and sections are renumbered. */
export function Ref({ to, children }: RefProps) {
  const page = usePage();
  const [base = "", part] = to.split(partSeparator);
  const target = findTarget(base, page);
  if (!target) {
    if (import.meta.env.DEV) log.warn(`Ref: nothing has the id "${to}".`);
    return <span {...stylex.props(s.missing)}>{children ?? `[${to}]`}</span>;
  }
  return (
    <a
      href={href(target.page, part ? `${target.fragment}${partSeparator}${part}` : target.fragment)}
      {...stylex.props(s.ref, ui.focus)}
    >
      {children ?? target.label}
    </a>
  );
}

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
            {/* The comment follows the name, or wraps under it as a whole when it does not fit. */}
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
  // A nested level indents under its folder's icon, with a guide line through its middle.
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
  figure: {
    justifySelf: "start",
    boxSizing: "border-box",
    width: "fit-content",
    minWidth: `min(100%, ${sizes.textWidth})`,
    maxWidth: "100%",
    marginBlock: space.xl2,
    marginInline: 0,
    paddingBlock: `${space.xl} ${space.lg}`,
    paddingInline: { default: space.xl, [when.narrow]: space.md },
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: theme.border,
    backgroundColor: theme.surface,
    // A faint drafting grid; labels and tabs paint their halo in the figure color.
    backgroundImage: `radial-gradient(circle at 1px 1px, ${theme.figureGrid} 1px, transparent 0)`,
    backgroundSize: "20px 20px",
    backgroundPosition: "10px 10px",
    "--figure-bg": theme.surface,
    scrollMarginTop: `calc(${sizes.headerHeight} + ${space.xl})`,
    breakInside: "avoid",
  },
  /** Holding columns, a figure or listing takes the whole width so each column gets a fair share. */
  figureWide: {
    width: "100%",
  },
  figurePart: {
    minWidth: 0,
    overflowX: "auto",
  },
  figureInReply: {
    minWidth: 0,
    marginBlock: space.lg,
    paddingBlock: `${space.md} ${space.md}`,
    paddingInline: space.md,
  },
  scroll: {
    overflowX: "auto",
    overscrollBehaviorInline: "contain",
  },
  caption: {
    marginTop: space.lg,
    paddingTop: space.md,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: theme.border,
    color: theme.textMuted,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.normal,
  },
  captionLine: {
    display: "flex",
    alignItems: "flex-start",
    gap: space.md,
  },
  captionText: {
    maxWidth: sizes.textWidth,
  },
  captionActions: {
    flexShrink: 0,
    marginLeft: "auto",
    // Center the buttons on the first line of text.
    marginTop: `calc((1lh - ${sizes.controlSmall}) / 2)`,
  },
  label: {
    // With the space after the label, so a double click selects the caption word alone.
    marginRight: "0.25em",
    color: theme.text,
    fontWeight: fontWeight.semibold,
  },
  titled: {
    justifySelf: "start",
    minWidth: `min(100%, ${sizes.textWidth})`,
    maxWidth: "100%",
    marginBlock: space.xl2,
    marginInline: 0,
    scrollMarginTop: `calc(${sizes.headerHeight} + ${space.xl})`,
    breakInside: "avoid",
  },
  title: {
    maxWidth: sizes.textWidth,
    marginBottom: `calc(-1 * ${space.md})`,
    color: theme.textMuted,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.normal,
  },
  ref: {
    color: theme.accentStrong,
    textDecorationLine: "underline",
    textDecorationColor: theme.accentBorder,
    textUnderlineOffset: "0.24em",
  },
  missing: {
    color: theme.warning,
  },
});
