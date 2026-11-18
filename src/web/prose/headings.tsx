import * as stylex from "@stylexjs/stylex";
import { type HTMLAttributes, useContext } from "react";
import { numbering, numbersOf, usePage } from "../page/numbering.ts";
import { TargetActions, targetHost, targetProps } from "../page/targets.tsx";
import {
  fontSize,
  fontWeight,
  letterSpacing,
  lineHeight,
  sizes,
  space,
  theme,
} from "../style/theme.stylex.ts";
import { ReadingContext, useScopedId } from "./contexts.ts";

type Props = HTMLAttributes<HTMLElement>;

/** The page title, with the chapter number above it. It stands for the page as a target. */
export function H1({ children, ...props }: Props) {
  const { reply } = useContext(ReadingContext);
  const page = usePage();
  const chapter = numbering.sections && !reply ? numbersOf(page)?.chapter : undefined;
  const title = page?.outline.title;
  return (
    <hgroup {...stylex.props(s.titleGroup)}>
      {chapter && <p {...stylex.props(s.chapter)}>Chapter {chapter}</p>}
      {/* The title stands for the whole page: commenting on it adds the page as a reference. */}
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

/** A section heading, numbered, and a target with its Link and Comment buttons. */
export function Section({ level, id, children, ...props }: Props & { level: 2 | 3 }) {
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

const s = stylex.create({
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
  replyH1: { fontSize: fontSize.base, marginBottom: space.sm },
  replyH2: {
    fontSize: fontSize.sm,
    marginTop: space.lg,
    marginBottom: space.xs,
    paddingTop: 0,
    borderTopWidth: 0,
  },
  replyH3: { fontSize: fontSize.sm, marginTop: space.md, marginBottom: space.xs },
});
