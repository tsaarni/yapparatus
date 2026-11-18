import * as stylex from "@stylexjs/stylex";
import {
  createElement,
  type HTMLAttributes,
  type ImgHTMLAttributes,
  type ReactNode,
  useContext,
} from "react";
import {
  fontSize,
  fontWeight,
  lineHeight,
  radius,
  space,
  theme,
  when,
} from "../style/theme.stylex.ts";
import { Blockquote } from "./blockquote.tsx";
import { Pre } from "./code-block.tsx";
import { ReadingContext } from "./contexts.ts";
import { DataCell, DataTable, HeaderCell } from "./data-table.tsx";
import { isBreakout } from "./flow.tsx";
import { H1, Section } from "./headings.tsx";
import { Link } from "./link.tsx";

type Props = HTMLAttributes<HTMLElement>;

/** A top-level block, tagged by the source plugin with its file, lines, and revision. */
function Block(props: Props & { "data-source"?: string; children?: ReactNode }) {
  if (!props["data-source"]) return <div {...props} />;
  const wide = isBreakout(props.children);
  return <div {...props} {...stylex.props(s.block, wide && s.wideBlock)} />;
}

function Paragraph(props: Props & { "data-lead"?: string }) {
  const { reply } = useContext(ReadingContext);
  const lead = props["data-lead"] === "true" && !reply;
  return <p {...props} {...stylex.props(s.p, reply && s.replyText, lead && s.lead)} />;
}

/** Inline code: code in a block is drawn by `CodeBlock`. */
function Code(props: Props) {
  return <code {...props} {...stylex.props(s.code, s.inlineCode)} />;
}

/**
 * Math, compiled to MathML. Block math scrolls sideways when it is wider than the column, so
 * the page does not.
 */
function MathElement(props: Props & { display?: string }) {
  const block = props.display === "block";
  // React's JSX types have no MathML elements.
  return createElement("math", { ...props, ...stylex.props(s.math, block && s.mathBlock) });
}

function ListElement({ ordered, ...props }: Props & { ordered: boolean }) {
  const { reply } = useContext(ReadingContext);
  const Tag = ordered ? "ol" : "ul";
  return <Tag {...props} {...stylex.props(s.list, reply && s.replyText)} />;
}

/** The elements that Markdown compiles to, as pages and replies draw them. */
export const prose = {
  div: Block,
  h1: H1,
  h2: (props: Props) => <Section level={2} {...props} />,
  h3: (props: Props) => <Section level={3} {...props} />,
  p: Paragraph,
  a: Link,
  pre: Pre,
  code: Code,
  math: MathElement,
  ul: (props: Props) => <ListElement ordered={false} {...props} />,
  ol: (props: Props) => <ListElement ordered {...props} />,
  img: (props: ImgHTMLAttributes<HTMLImageElement>) => (
    <img {...props} alt={props.alt ?? ""} {...stylex.props(s.img)} />
  ),
  strong: (props: Props) => <strong {...props} {...stylex.props(s.strong)} />,
  li: (props: HTMLAttributes<HTMLLIElement>) => <li {...props} {...stylex.props(s.li)} />,
  blockquote: Blockquote,
  hr: (props: HTMLAttributes<HTMLHRElement>) => <hr {...props} {...stylex.props(s.hr)} />,
  table: DataTable,
  td: DataCell,
  th: HeaderCell,
};

const s = stylex.create({
  block: {
    gridColumn: "content",
    minWidth: 0,
  },
  wideBlock: {
    gridColumn: "content-start / wide-end",
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
  math: {
    fontFamily: theme.math,
  },
  mathBlock: {
    display: "block math",
    marginBlock: "0 1.1em",
    paddingBlock: space.xs,
    overflowX: "auto",
    overflowY: "hidden",
    fontSize: fontSize.lg,
  },
  hr: {
    marginBlock: space.xl3,
    borderWidth: 0,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: theme.border,
  },
  img: {
    maxWidth: "100%",
    height: "auto",
  },
  replyText: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.normal,
  },
});
