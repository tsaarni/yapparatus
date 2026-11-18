/** Figure, Table, and Listing: framed and titled blocks that pages number and link to. */

import * as stylex from "@stylexjs/stylex";
import { type HTMLAttributes, type ReactNode, useContext } from "react";
import { blockLabel, usePage } from "../addressing/numbering.ts";
import { TargetActions, targetHost, targetProps } from "../addressing/targets.tsx";
import {
  InFigureContext,
  InTargetContext,
  ReadingContext,
  useScopedId,
} from "../prose/contexts.ts";
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

/** What an author writes on a figure, and the width the compiler sets. */
export interface FigureProps extends HTMLAttributes<HTMLElement> {
  caption?: string;
  description?: string;
  /** The figure takes the whole width, as when it holds columns. Set by the compiler. */
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
  if (inFigure)
    return (
      <div {...styled(`figure-nested ${props.className ?? ""}`, s.figureNested)}>
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
      {!titled && actions}
      <section
        {...styled("figure-scroll", s.scroll, focus.ring)}
        aria-label={description ?? caption ?? "Figure"}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: Horizontal figure overflow must be keyboard scrollable.
        tabIndex={0}
      >
        <InFigureContext.Provider value={true}>{children}</InFigureContext.Provider>
      </section>
      {titled ? (
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
 * A titled table: wrap a Markdown table in `<Table id="routes" caption="The API routes.">`.
 * The title goes above the table, as in print.
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

/** A table or listing with a numbered title above it. */
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

const s = stylex.create({
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
    /** Labels and tabs paint their halo in the figure color. */
    "--figure-bg": theme.surface,
    scrollMarginTop: `calc(${sizes.headerHeight} + ${space.xl})`,
    breakInside: "avoid",
  },
  /** Holding columns, a figure or listing takes the whole width so each column gets its share. */
  figureWide: {
    width: "100%",
  },
  figureNested: {
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
    /** Center the buttons on the first line of text. */
    marginTop: `calc((1lh - ${sizes.controlSmall}) / 2)`,
  },
  label: {
    /** With the space after the label, so a double click selects the caption word alone. */
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
});
