import * as stylex from "@stylexjs/stylex";
import {
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
  useContext,
  useMemo,
  useRef,
} from "react";
import type { LineRange } from "../../document/file-address.ts";
import { fileAddress, linesLabel } from "../../document/file-address.ts";
import type { HighlightedCode } from "../../document/page-module.ts";
import { fileHref } from "../addressing/router.ts";
import { TargetActions, targetHost, targetProps } from "../addressing/targets.tsx";
import { Button } from "../controls/button.tsx";
import { useCopy } from "../controls/clipboard.ts";
import { focus } from "../style/focus.ts";
import { styled } from "../style/styled.ts";
import {
  fontSize,
  fontWeight,
  lineHeight,
  radius,
  sizes,
  space,
  theme,
  when,
} from "../style/theme.stylex.ts";
import { InTargetContext, ReadingContext, SourceFileContext } from "./contexts.ts";
import { clickLineNumber, pressLineNumber } from "./line-numbers.ts";

/**
 * Highlighted code as a code block, with a bar that names its language or links to its file,
 * and a Copy button. Lines in `selected` are highlighted for the reader.
 */
export function CodeBlock({
  code,
  selected,
}: {
  code: HighlightedCode;
  selected?: LineRange | undefined;
}) {
  const { reply } = useContext(ReadingContext);
  const inTarget = useContext(InTargetContext);
  const sourceFile = useContext(SourceFileContext);
  const ref = useRef<HTMLPreElement>(null);
  const [copied, copy] = useCopy();
  const lines = useMemo(
    () => codeLines(code, selected, sourceFile?.wrap ?? false),
    [code, selected, sourceFile?.wrap],
  );
  const language = code.language;
  const languageName = language !== "text" ? (languageNames[language] ?? language) : "";
  // A bare code block is its own target; inside a Listing, the listing is. The file view's
  // code is the file, which its title stands for.
  const target = !inTarget && !reply && !sourceFile?.whole;
  const excerpt = sourceFile && !sourceFile.whole ? sourceFile.file : undefined;
  return (
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
              {...stylex.props(s.fileLink, focus.ring)}
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
      <pre
        ref={ref}
        data-language={language}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: Code that scrolls must be keyboard scrollable.
        tabIndex={0}
        {...stylex.props(s.pre, sourceFile?.wrap && s.wrapPre)}
      >
        <code {...stylex.props(s.code)}>{lines}</code>
      </pre>
    </div>
  );
}
CodeBlock.breakout = true;

/** A code block on a page: the compiler gives its highlighted code as JSON. */
export function Pre({ "data-code": json }: { "data-code": string }) {
  const code = useMemo(() => JSON.parse(json) as HighlightedCode, [json]);
  return <CodeBlock code={code} />;
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

/** "color:var(--x);font-style:italic" → { color: "var(--x)", fontStyle: "italic" } */
function styleObject(style: string): CSSProperties {
  const out: Record<string, string> = {};
  for (const declaration of style.split(";")) {
    const colon = declaration.indexOf(":");
    const name = declaration.slice(0, colon).trim();
    if (colon < 0 || !name) continue;
    out[name.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase())] = declaration
      .slice(colon + 1)
      .trim();
  }
  return out as CSSProperties;
}

/**
 * The lines of a code block, separated by newlines, each a span of its tokens. Every line has
 * the same box, so tab stops line up across lines. A marked line gets its mark's background
 * and gutter. A line of a source file shows its number in the file beside it; a line the
 * reader picked in the file view is highlighted.
 */
function codeLines(code: HighlightedCode, selected: LineRange | undefined, wrap: boolean) {
  const styles = code.styles.map((style) => (style ? styleObject(style) : undefined));
  const numbered = code.start !== undefined;
  return code.lines.flatMap((tokens, index) => {
    const number = numbered ? (code.start as number) + index : undefined;
    const picked =
      number !== undefined && selected && number >= selected.start && number <= selected.end;
    const mark = picked ? "highlight" : code.marks?.[index];
    const runs: ReactNode[] = [];
    for (let i = 0; i < tokens.length; i += 2)
      runs.push(
        <span key={i} style={styles[tokens[i] as number]}>
          {tokens[i + 1]}
        </span>,
      );
    const line = (
      <span
        // biome-ignore lint/suspicious/noArrayIndexKey: The lines are the code's, in order.
        key={index}
        data-line={number}
        data-source-line={code.pageLines?.[index]}
        data-mark={code.marks?.[index]}
        data-selected={picked ? "true" : undefined}
        {...styled(
          "line",
          s.line,
          mark && s[mark],
          numbered && s.numbered,
          numbered && wrap && s.hanging,
        )}
      >
        {runs}
      </span>
    );
    return index ? ["\n", line] : [line];
  });
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

/** Code blocks: 16 px padding on each side and a 1 px border on each side. */
const codeInset = `calc(2 * ${space.lg} + 2px)`;
/** A source line's number and the space after it, sized for the widest number in the block. */
const lineNumberWidth = "calc(var(--line-digits, 3) * 1ch + 1.5ch)";

const s = stylex.create({
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
  /** Inline code is sized to the text around it, so it fits headings and replies alike. */
  code: {
    fontFamily: theme.mono,
    fontSize: "0.875em",
    fontVariantLigatures: "none",
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
});
