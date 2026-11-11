import * as stylex from "@stylexjs/stylex";
import {
  type AnchorHTMLAttributes,
  Children,
  type CSSProperties,
  createContext,
  Fragment,
  type HTMLAttributes,
  type ImgHTMLAttributes,
  isValidElement,
  type MouseEvent,
  type ReactNode,
  type ThHTMLAttributes,
  useContext,
  useRef,
} from "react";
import { type FileAddress, fileAddress, linesLabel } from "../files.ts";
import type { AlertKind, CodeMark } from "../markdown-plugin.ts";
import { AppIcon as Icon } from "./icons.tsx";
import { clickLineNumber, pressLineNumber } from "./line-numbers.ts";
import { numbering, numbersOf, usePage } from "./numbering.ts";
import { fileHref, resolveHref } from "./router.ts";
import { TargetActions, targetHost, targetProps } from "./targets.tsx";
import {
  duration,
  fontSize,
  fontWeight,
  letterSpacing,
  lineHeight,
  radius,
  sizes,
  space,
  theme,
  when,
} from "./theme.stylex.ts";
import { Button, styled, ui, useCopy } from "./ui.tsx";

/**
 * Where prose is shown: a page, or a chat reply with smaller type. Content in a reply
 * prefixes its ids, so its anchors never collide with the page's.
 */
export const ReadingContext = createContext({ reply: false, idPrefix: "" });

/** Inside a titled table or listing, which is the target itself. */
export const InTargetContext = createContext(false);

/** Inside a figure, which already draws the frame, so content inside draws none of its own. */
export const InFigureContext = createContext(false);

/** The DOM id for an authored id, namespaced inside replies. */
export function useScopedId(id: string | undefined) {
  const { idPrefix } = useContext(ReadingContext);
  return id ? `${idPrefix}${id}` : undefined;
}
const CodeContext = createContext(false);

type Props = HTMLAttributes<HTMLElement>;

/**
 * The source file a code block shows: an excerpt's lines on a page, or the whole file in the
 * file view. Its lines carry their numbers in the file.
 */
export interface SourceFileCode {
  file: FileAddress;
  /** The whole file, in the file view; otherwise an excerpt, which links to it. */
  whole: boolean;
  /** The widest line number's digits, so numbers line up. */
  digits: number;
  /** Long lines wrap under their own number instead of scrolling. */
  wrap: boolean;
}
export const SourceFileContext = createContext<SourceFileCode | undefined>(undefined);

/** Components that may use the wide figure track mark themselves with this flag. */
export interface Breakout {
  breakout?: boolean;
}

/** Whether a block's content may use the wide track. Looks through fragments, which plugins such as the code highlighter add. */
function isBreakout(children: ReactNode): boolean {
  const child = Children.toArray(children).find(isValidElement);
  if (!child) return false;
  if (child.type === Fragment)
    return isBreakout((child.props as { children?: ReactNode }).children);
  return !!(child.type as Breakout).breakout;
}

/**
 * The blocks of a panel, top to bottom. Text keeps the reading measure, and wide blocks such
 * as code and figures may grow beyond it, as on the page. Wide blocks bring their own margin;
 * text that comes first gets the same distance from what is above. With `fill`, the last
 * block takes the remaining height, so code blocks side by side end on one line.
 */
export function Flow({ children, fill }: { children: ReactNode; fill?: boolean }) {
  const blocks = Children.toArray(children);
  return (
    <div {...stylex.props(s.flow)}>
      {blocks.map((block, index) => {
        const wide = isBreakout(block);
        return (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: The blocks are the page's, in source order.
            key={index}
            {...stylex.props(
              s.flowBlock,
              !wide && s.flowText,
              index === 0 && !wide && s.flowLead,
              fill && index === blocks.length - 1 && s.flowFill,
            )}
          >
            {block}
          </div>
        );
      })}
    </div>
  );
}

/** A top-level block, tagged by the source plugin with its file, lines, and revision. */
function Block(props: Props & { "data-source"?: string; children?: ReactNode }) {
  if (!props["data-source"]) return <div {...props} />;
  const wide = isBreakout(props.children);
  return <div {...props} {...stylex.props(s.block, wide && s.wideBlock)} />;
}

function H1({ children, ...props }: Props) {
  const { reply } = useContext(ReadingContext);
  const page = usePage();
  const chapter = numbering.sections && !reply ? numbersOf(page)?.chapter : undefined;
  const title = page?.outline.title;
  return (
    <hgroup {...stylex.props(s.titleGroup)}>
      {chapter && <p {...stylex.props(s.chapter)}>Chapter {chapter}</p>}
      {/* The title stands for the whole page: asking about it adds the page as context. */}
      <h1
        {...props}
        {...(reply ? {} : targetProps("page", chapter ? `Chapter ${chapter}` : undefined, title))}
        {...stylex.props(s.heading, s.h1, reply && s.replyH1, ...(reply ? [] : targetHost))}
      >
        {children}
        {!reply && (
          <TargetActions
            name={chapter ? `Chapter ${chapter}` : (title ?? "this page")}
            placement="inline"
            linkable={false}
          />
        )}
      </h1>
    </hgroup>
  );
}

function Section({ level, id, children, ...props }: Props & { level: 2 | 3 }) {
  const { reply } = useContext(ReadingContext);
  const page = usePage();
  const domId = useScopedId(id);
  const number = numbering.sections && !reply && id ? numbersOf(page)?.sections.get(id) : undefined;
  const title = page?.outline?.headings.find((h) => h.id === id)?.text;
  const Tag = level === 2 ? "h2" : "h3";
  return (
    <Tag
      id={domId}
      {...props}
      {...targetProps("section", number ? `Section ${number}` : undefined, title)}
      {...stylex.props(
        s.heading,
        level === 2 ? s.h2 : s.h3,
        reply && (level === 2 ? s.replyH2 : s.replyH3),
        ...targetHost,
      )}
    >
      {number && <span {...stylex.props(s.number)}>{number} </span>}
      {children}
      {!reply && (
        <TargetActions
          name={number ? `Section ${number}` : (title ?? "this section")}
          placement="inline"
          linkable={!!id}
        />
      )}
    </Tag>
  );
}

function Paragraph(props: Props & { "data-lead"?: string }) {
  const { reply } = useContext(ReadingContext);
  const lead = props["data-lead"] === "true" && !reply;
  return <p {...props} {...stylex.props(s.p, reply && s.replyText, lead && s.lead)} />;
}

function Pre({
  style: _shikiStyle,
  ...props
}: HTMLAttributes<HTMLPreElement> & { "data-language"?: string }) {
  const { reply } = useContext(ReadingContext);
  const inTarget = useContext(InTargetContext);
  const sourceFile = useContext(SourceFileContext);
  const language = props["data-language"];
  const ref = useRef<HTMLPreElement>(null);
  const [copied, copy] = useCopy();
  const languageName = language && language !== "text" ? (languageNames[language] ?? language) : "";
  // A bare code block is its own target; inside a Listing, the listing is. The file view's
  // code is the file, which its title stands for.
  const target = !inTarget && !reply && !sourceFile?.whole;
  const excerpt = sourceFile && !sourceFile.whole ? sourceFile.file : undefined;
  return (
    <CodeContext.Provider value={true}>
      <div
        {...(target
          ? targetProps("code", undefined, languageName ? `${languageName} code` : "Code")
          : {})}
        {...(sourceFile
          ? {
              "data-file": fileAddress({
                folder: sourceFile.file.folder,
                path: sourceFile.file.path,
              }),
            }
          : {})}
        {...stylex.props(
          s.codeBlock,
          reply && s.replyPre,
          sourceFile?.whole && s.wholeFile,
          ...(target ? targetHost : []),
        )}
        style={sourceFile ? ({ "--line-digits": sourceFile.digits } as CSSProperties) : undefined}
        {...(sourceFile
          ? {
              onMouseDown: pressLineNumber,
              onClick: (event: MouseEvent) => clickLineNumber(event, sourceFile),
            }
          : {})}
      >
        <div {...stylex.props(s.codeBar)}>
          <span {...stylex.props(s.grow)}>
            {excerpt ? (
              <a
                href={fileHref({ folder: excerpt.folder, path: excerpt.path })}
                {...stylex.props(s.fileLink, ui.focus)}
              >
                {excerpt.folder}/{excerpt.path}
                {excerpt.lines && (
                  <span {...stylex.props(s.fileLines)}>:{linesLabel(excerpt.lines)}</span>
                )}
              </a>
            ) : (
              languageName
            )}
          </span>
          {target && (
            <TargetActions
              name={`this ${languageName || "code"} block`}
              placement="inline"
              linkable={false}
            />
          )}
          <Button
            variant="ghost"
            size="small"
            aria-label={copied === "failed" ? "The clipboard is not available" : "Copy code"}
            title={copied === "failed" ? "The clipboard is not available" : undefined}
            onClick={() => void copy(ref.current ? codeText(ref.current) : "")}
          >
            {copied === "copied" ? "Copied" : copied === "failed" ? "Not copied" : "Copy"}
          </Button>
        </div>
        <pre ref={ref} {...props} {...stylex.props(s.pre, sourceFile?.wrap && s.wrapPre)} />
      </div>
    </CodeContext.Provider>
  );
}

Pre.breakout = true;

/** The code as it reads after a change: removed lines are left out. */
function codeText(pre: HTMLPreElement) {
  const code = pre.querySelector("code");
  if (!code) return pre.textContent ?? "";
  return [...code.children]
    .filter((line) => line.getAttribute("data-mark") !== "remove")
    .map((line) => line.textContent)
    .join("\n");
}

/**
 * Spans are code lines and the highlighted tokens inside them; tokens pass through. Every line
 * has the same box, so tab stops line up across lines. A line marked with `[!code highlight]`,
 * `[!code ++]`, or `[!code --]` gets its mark's background and gutter. A line of a source file
 * shows its number in the file beside it; a line the reader picked in the file view is
 * highlighted.
 */
function Span(
  props: HTMLAttributes<HTMLSpanElement> & {
    "data-mark"?: CodeMark;
    "data-line"?: number;
    "data-selected"?: string;
  },
) {
  const wrap = useContext(SourceFileContext)?.wrap ?? false;
  if (!props.className?.split(" ").includes("line")) return <span {...props} />;
  const mark = props["data-selected"] ? "highlight" : props["data-mark"];
  const numbered = props["data-line"] !== undefined;
  return (
    <span
      {...props}
      {...styled(
        "line",
        s.line,
        mark && s[mark],
        numbered && s.numbered,
        numbered && wrap && s.hanging,
      )}
    />
  );
}

const alertTitles: Record<AlertKind, string> = {
  note: "Note",
  tip: "Tip",
  important: "Important",
  warning: "Warning",
  caution: "Caution",
};

/** A blockquote, or with `> [!NOTE]` and the like as its first line, an alert of that kind. */
function Blockquote({
  children,
  ...props
}: HTMLAttributes<HTMLElement> & { "data-alert"?: AlertKind }) {
  const kind = props["data-alert"];
  if (!kind)
    return (
      <blockquote {...props} {...stylex.props(s.blockquote)}>
        {children}
      </blockquote>
    );
  return (
    <div role="note" {...props} {...styled("alert", s.alert, alertStyles[kind])}>
      <p {...stylex.props(s.alertTitle)}>
        <Icon name={kind} size={16} />
        {alertTitles[kind]}
      </p>
      {children}
    </div>
  );
}

const languageNames: Record<string, string> = {
  ts: "TypeScript",
  tsx: "TSX",
  js: "JavaScript",
  jsx: "JSX",
  json: "JSON",
  sh: "Shell",
  bash: "Shell",
  http: "HTTP",
  html: "HTML",
  css: "CSS",
  mdx: "MDX",
  md: "Markdown",
  py: "Python",
  python: "Python",
  go: "Go",
  rust: "Rust",
  yaml: "YAML",
  sql: "SQL",
};

function Code(props: Props) {
  const block = useContext(CodeContext);
  return <code {...props} {...stylex.props(s.code, !block && s.inlineCode)} />;
}

function Link({ href: raw, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const page = usePage();
  const target = resolveHref(raw, page);
  const external = /^[a-z][a-z0-9+.-]*:/i.test(target);
  return (
    <a
      {...props}
      href={target}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
      {...stylex.props(s.link, ui.focus)}
    />
  );
}

function ListElement({ ordered, ...props }: Props & { ordered: boolean }) {
  const { reply } = useContext(ReadingContext);
  const Tag = ordered ? "ol" : "ul";
  return <Tag {...props} {...stylex.props(s.list, reply && s.replyText)} />;
}

/**
 * Tables, like figures, are at least as wide as the text column and grow to the right
 * into the wide track as far as their content needs. Beyond that they scroll.
 */
function DataTable(props: HTMLAttributes<HTMLTableElement>) {
  return (
    // biome-ignore lint/a11y/noNoninteractiveTabindex: Wide tables must be keyboard scrollable.
    <div tabIndex={0} {...stylex.props(s.tableScroll, ui.focus)}>
      <table {...props} {...stylex.props(s.table)} />
    </div>
  );
}
DataTable.breakout = true;

export const prose = {
  div: Block,
  h1: H1,
  h2: (props: Props) => <Section level={2} {...props} />,
  h3: (props: Props) => <Section level={3} {...props} />,
  p: Paragraph,
  a: Link,
  pre: Pre,
  code: Code,
  ul: (props: Props) => <ListElement ordered={false} {...props} />,
  ol: (props: Props) => <ListElement ordered {...props} />,
  img: (props: ImgHTMLAttributes<HTMLImageElement>) => (
    <img {...props} alt={props.alt ?? ""} {...stylex.props(s.img)} />
  ),
  strong: (props: Props) => <strong {...props} {...stylex.props(s.strong)} />,
  li: (props: HTMLAttributes<HTMLLIElement>) => <li {...props} {...stylex.props(s.li)} />,
  blockquote: Blockquote,
  span: Span,
  hr: (props: HTMLAttributes<HTMLHRElement>) => <hr {...props} {...stylex.props(s.hr)} />,
  table: DataTable,
  td: ({ children, ...props }: HTMLAttributes<HTMLTableCellElement>) => (
    <td {...props} {...stylex.props(s.cell)}>
      <div {...stylex.props(s.cellMeasure)}>{children}</div>
    </td>
  ),
  th: (props: ThHTMLAttributes<HTMLTableCellElement>) => (
    <th {...props} {...stylex.props(s.cell, s.th)} />
  ),
};

/** Code blocks: 16 px padding on each side and a 1 px border on each side. */
const codeInset = `calc(2 * ${space.lg} + 2px)`;
/** A source line's number and the space after it, sized for the widest number in the block. */
const lineNumberWidth = "calc(var(--line-digits, 3) * 1ch + 1.5ch)";

const s = stylex.create({
  block: {
    gridColumn: "content",
    minWidth: 0,
  },
  wideBlock: {
    gridColumn: "content-start / wide-end",
  },
  flow: {
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    minWidth: 0,
  },
  flowBlock: {
    minWidth: 0,
  },
  flowText: {
    maxWidth: sizes.textWidth,
  },
  flowLead: {
    paddingTop: space.md,
  },
  /** A grid stretches its one child, such as a code block's frame, to the full height. */
  flowFill: {
    flexGrow: 1,
    display: "grid",
  },
  titleGroup: {
    marginBottom: space.md,
  },
  chapter: {
    margin: 0,
    marginBottom: space.md,
    color: theme.accent,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    letterSpacing: letterSpacing.caps,
    textTransform: "uppercase",
  },
  heading: {
    position: "relative",
    color: theme.text,
    fontWeight: fontWeight.semibold,
    scrollMarginTop: `calc(${sizes.headerHeight} + ${space.xl})`,
    breakAfter: "avoid",
  },
  h1: {
    margin: 0,
    fontSize: fontSize.xxl,
    lineHeight: lineHeight.tight,
    letterSpacing: letterSpacing.tight,
    textWrap: "balance",
  },
  h2: {
    marginTop: space.xl2,
    marginBottom: space.md,
    paddingTop: space.xl,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: theme.border,
    fontSize: fontSize.xl,
    lineHeight: lineHeight.snug,
    letterSpacing: letterSpacing.tight,
    textWrap: "balance",
  },
  h3: {
    marginTop: space.xl2,
    marginBottom: space.sm,
    fontSize: fontSize.lg,
    lineHeight: lineHeight.snug,
    letterSpacing: letterSpacing.snug,
  },
  number: {
    // With the space after the number, so a double click selects the title word alone.
    marginRight: "0.35em",
    color: theme.textMuted,
    fontWeight: fontWeight.medium,
    fontVariantNumeric: "tabular-nums",
  },
  p: {
    marginBlock: "0 1.1em",
    fontSize: fontSize.base,
    lineHeight: lineHeight.relaxed,
  },
  lead: {
    marginBottom: space.sm,
    color: theme.textMuted,
    fontSize: { default: fontSize.lg, [when.narrow]: fontSize.base },
    lineHeight: lineHeight.normal,
  },
  list: {
    marginBlock: "0 1.2em",
    paddingLeft: "1.3em",
    fontSize: fontSize.base,
    lineHeight: lineHeight.relaxed,
  },
  li: {
    marginBlock: "0.3em",
    paddingLeft: "0.25em",
    "::marker": { color: theme.textMuted },
  },
  strong: {
    color: theme.text,
    fontWeight: fontWeight.semibold,
  },
  link: {
    color: theme.accentStrong,
    textDecorationLine: "underline",
    textDecorationColor: { default: theme.accentBorder, ":hover": theme.accent },
    textDecorationThickness: "1px",
    textUnderlineOffset: "0.24em",
    transitionProperty: "text-decoration-color",
    transitionDuration: duration.fast,
  },
  /** Inline code is sized to the text around it, so it fits headings and replies alike. */
  code: {
    fontFamily: theme.mono,
    fontSize: "0.875em",
    fontVariantLigatures: "none",
  },
  inlineCode: {
    paddingBlock: "0.1em",
    paddingInline: "0.36em",
    borderRadius: radius.sm,
    color: theme.text,
    backgroundColor: theme.surfaceRaised,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: theme.border,
  },
  /**
   * Code never wraps. A block is at least as wide as the text and grows to the right to
   * fit its longest line, up to 100 columns; longer lines scroll.
   */
  codeBlock: {
    justifySelf: "start",
    boxSizing: "border-box",
    width: "fit-content",
    minWidth: `min(100%, ${sizes.textWidth})`,
    maxWidth: `min(100%, calc(100ch + ${codeInset}))`,
    fontFamily: theme.mono,
    fontSize: fontSize.sm,
    marginBlock: space.xl,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: theme.border,
    backgroundColor: theme.surface,
    overflow: "hidden",
    breakInside: "avoid",
  },
  grow: { flexGrow: 1 },
  /** The file view shows a whole file: the code is the page, so it sits close under the title. */
  wholeFile: {
    marginTop: space.lg,
  },
  fileLink: {
    color: theme.text,
    fontFamily: theme.mono,
    textDecorationLine: { default: "none", ":hover": "underline" },
    textUnderlineOffset: "0.24em",
  },
  fileLines: {
    color: theme.textMuted,
  },
  /**
   * A source file's line number, beside the line and outside its text: copying or selecting
   * code never picks it up.
   */
  numbered: {
    "::before": {
      content: "attr(data-line)",
      display: "inline-block",
      boxSizing: "border-box",
      width: lineNumberWidth,
      paddingRight: "1.5ch",
      textAlign: "right",
      color: theme.textMuted,
      opacity: 0.7,
      userSelect: "none",
      cursor: "pointer",
    },
  },
  /** A wrapped line continues after its number, so the number stands alone in the gutter. */
  hanging: {
    paddingInlineStart: `calc(${space.lg} - 3px + ${lineNumberWidth})`,
    "::before": {
      marginInlineStart: `calc(-1 * ${lineNumberWidth})`,
    },
  },
  codeBar: {
    fontFamily: theme.sans,
    display: { default: "flex", [when.print]: "none" },
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: sizes.control,
    paddingInline: `${space.lg} ${space.xs}`,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: theme.border,
    color: theme.textMuted,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  pre: {
    margin: 0,
    padding: space.lg,
    overflowX: "auto",
    color: theme.textBody,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.relaxed,
    tabSize: 2,
    "--shiki-foreground": theme.textBody,
    "--shiki-background": "transparent",
    "--shiki-token-keyword": theme.codeKeyword,
    "--shiki-token-string": theme.codeString,
    "--shiki-token-string-expression": theme.codeString,
    "--shiki-token-function": theme.codeFunction,
    "--shiki-token-constant": theme.codeConstant,
    "--shiki-token-comment": theme.textMuted,
    "--shiki-token-punctuation": theme.textMuted,
    "--shiki-token-parameter": theme.textBody,
    "--shiki-token-link": theme.accent,
  },
  /** An excerpt with `wrap`: long lines break at the block's edge instead of scrolling. */
  wrapPre: {
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
  },
  replyPre: {
    marginBlock: space.md,
  },
  // A line spans the block, from edge to edge of the padding, with a gutter that a mark colors.
  // It takes the block's line height, not the smaller code text's, so marked lines in a row
  // join into one band. Every line has this box: a tab stop is measured from the line's box,
  // so a marked line with its own box would shift tab-indented text.
  line: {
    display: "inline-block",
    verticalAlign: "top",
    lineHeight: `calc(${lineHeight.relaxed} * ${fontSize.sm})`,
    boxSizing: "border-box",
    minWidth: `calc(100% + 2 * ${space.lg})`,
    marginInline: `calc(-1 * ${space.lg})`,
    paddingInline: `calc(${space.lg} - 3px) ${space.lg}`,
    borderLeftWidth: 3,
    borderLeftStyle: "solid",
    borderLeftColor: "transparent",
  },
  highlight: {
    borderLeftColor: theme.accent,
    backgroundColor: `color-mix(in srgb, ${theme.accent} 12%, transparent)`,
  },
  add: {
    borderLeftColor: theme.success,
    backgroundColor: `color-mix(in srgb, ${theme.success} 12%, transparent)`,
    "::before": {
      content: '"+"',
      display: "inline-block",
      width: space.md,
      marginLeft: `calc(-1 * ${space.md})`,
      color: theme.success,
      userSelect: "none",
    },
  },
  remove: {
    borderLeftColor: theme.error,
    backgroundColor: `color-mix(in srgb, ${theme.error} 10%, transparent)`,
    opacity: 0.75,
    "::before": {
      content: '"−"',
      display: "inline-block",
      width: space.md,
      marginLeft: `calc(-1 * ${space.md})`,
      color: theme.error,
      userSelect: "none",
    },
  },
  alert: {
    marginBlock: space.xl,
    paddingBlock: `${space.md} ${space.xxs}`,
    paddingInline: space.lg,
    borderLeftWidth: 3,
    borderLeftStyle: "solid",
    borderRadius: radius.md,
    color: theme.textBody,
    breakInside: "avoid",
  },
  alertTitle: {
    display: "flex",
    alignItems: "center",
    gap: space.sm,
    margin: 0,
    marginBottom: space.xs,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: "var(--alert-ink)",
  },
  blockquote: {
    marginBlock: space.xl,
    marginInline: 0,
    paddingLeft: space.lg,
    borderLeftWidth: 2,
    borderLeftStyle: "solid",
    borderLeftColor: theme.accentBorder,
    color: theme.textMuted,
  },
  hr: {
    marginBlock: space.xl3,
    borderWidth: 0,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: theme.border,
  },
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
  img: {
    maxWidth: "100%",
    height: "auto",
  },
  replyH1: { fontSize: fontSize.base, marginBottom: space.sm },
  replyH2: {
    fontSize: fontSize.sm,
    marginTop: space.lg,
    marginBottom: space.xs,
    paddingTop: 0,
    borderTopWidth: 0,
  },
  replyH3: { fontSize: fontSize.sm, marginTop: space.md, marginBottom: space.xs },
  replyText: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.normal,
  },
});

/** Each alert kind's color, for its border, tint, and title. */
const alertStyles = stylex.create({
  note: {
    borderLeftColor: theme.accent,
    backgroundColor: theme.accentSurface,
    "--alert-ink": theme.accent,
  },
  tip: {
    borderLeftColor: theme.success,
    backgroundColor: `color-mix(in srgb, ${theme.success} 8%, transparent)`,
    "--alert-ink": theme.success,
  },
  important: {
    borderLeftColor: theme.accentStrong,
    backgroundColor: theme.accentSurface,
    "--alert-ink": theme.accentStrong,
  },
  warning: {
    borderLeftColor: theme.warning,
    backgroundColor: theme.warningSurface,
    "--alert-ink": theme.warning,
  },
  caution: {
    borderLeftColor: theme.error,
    backgroundColor: theme.errorSurface,
    "--alert-ink": theme.error,
  },
});
