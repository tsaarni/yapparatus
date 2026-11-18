import { type DocumentPage, pages } from "virtual:yapparatus/document";
import * as stylex from "@stylexjs/stylex";
import { href } from "../page/router.ts";
import { focus } from "../style/focus.ts";
import {
  duration,
  fontSize,
  fontWeight,
  radius,
  space,
  theme,
  when,
} from "../style/theme.stylex.ts";

/** Previous and next page, at the end of every page. */
export function PageFooter({ page }: { page: DocumentPage | undefined }) {
  const index = page ? pages.indexOf(page) : -1;
  if (index < 0) return null;
  const previous = pages[index - 1];
  const next = pages[index + 1];
  return (
    <nav aria-label="Previous and next page" {...stylex.props(s.pager)}>
      {previous ? (
        <a href={href(previous)} {...stylex.props(s.pagerLink, focus.ring)}>
          <span {...stylex.props(s.pagerLabel)}>← Previous</span>
          {previous.outline.title}
        </a>
      ) : (
        <span />
      )}
      {next && (
        <a href={href(next)} {...stylex.props(s.pagerLink, s.pagerNext, focus.ring)}>
          <span {...stylex.props(s.pagerLabel)}>Next →</span>
          {next.outline.title}
        </a>
      )}
    </nav>
  );
}

const s = stylex.create({
  pager: {
    gridColumn: "content",
    display: { default: "grid", [when.print]: "none" },
    gridTemplateColumns: "1fr 1fr",
    gap: space.md,
    marginTop: space.xl4,
  },
  pagerLink: {
    display: "grid",
    gap: space.xs,
    paddingBlock: space.md,
    paddingInline: space.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: { default: theme.border, ":hover": theme.accentBorder },
    backgroundColor: { default: "transparent", ":hover": theme.surface },
    color: theme.text,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    textDecoration: "none",
    transitionProperty: "border-color, background-color",
    transitionDuration: duration.fast,
  },
  pagerNext: {
    gridColumn: 2,
    textAlign: "right",
  },
  pagerLabel: {
    color: theme.textMuted,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
});
