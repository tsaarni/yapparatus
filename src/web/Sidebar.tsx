import { type DocumentPage, pages, settings } from "virtual:yapparatus/document";
import * as stylex from "@stylexjs/stylex";
import { useEffect, useState } from "react";
import { numbering, numbersOf } from "./numbering.ts";
import { href, scrollRoot } from "./router.ts";
import {
  duration,
  fontSize,
  fontWeight,
  layer,
  letterSpacing,
  lineHeight,
  radius,
  sizes,
  space,
  theme,
  when,
} from "./theme.stylex.ts";
import { styled, ui } from "./ui.tsx";

/** The section heading nearest above the reading position. */
function useCurrentSection(page: DocumentPage | undefined) {
  const [current, setCurrent] = useState<string>();
  useEffect(() => {
    const ids = page?.outline?.headings.filter((h) => h.depth === 2).map((h) => h.id) ?? [];
    const update = () => {
      const line = 120;
      let found: string | undefined;
      for (const id of ids) {
        const element = document.getElementById(id);
        if (element && element.getBoundingClientRect().top <= line) found = id;
      }
      setCurrent(found);
    };
    update();
    const root = scrollRoot();
    root.addEventListener("scroll", update, { passive: true });
    return () => root.removeEventListener("scroll", update);
  }, [page]);
  return current;
}

export function Sidebar({
  page,
  onNavigate,
  drawer,
}: {
  page: DocumentPage | undefined;
  onNavigate?: () => void;
  drawer: boolean;
}) {
  const section = useCurrentSection(page);
  return (
    <nav aria-label="Pages" {...styled("page-nav", s.nav, drawer && s.drawer)}>
      <p {...stylex.props(s.label)}>{settings.contentsLabel ?? "Contents"}</p>
      <ol {...stylex.props(s.list)}>
        {pages.map((item) => {
          const active = item === page;
          const chapter = numbersOf(item)?.chapter;
          const sections = item.outline?.headings.filter((h) => h.depth === 2) ?? [];
          return (
            <li key={item.id}>
              <a
                href={href(item)}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                {...styled("nav-item", s.page, ui.focus, active && s.pageActive)}
              >
                {numbering.sections && (
                  <span {...styled("nav-number", s.pageNumber)}>{chapter}</span>
                )}{" "}
                <span className="nav-label">{item.outline.title}</span>
              </a>
              {active && sections.length > 0 && (
                <ol {...stylex.props(s.sections)}>
                  {sections.map((heading) => (
                    <li key={heading.id}>
                      <a
                        href={href(item, heading.id)}
                        onClick={onNavigate}
                        aria-current={heading.id === section ? "location" : undefined}
                        {...stylex.props(
                          s.section,
                          ui.focus,
                          heading.id === section && s.sectionActive,
                        )}
                      >
                        {heading.text}
                      </a>
                    </li>
                  ))}
                </ol>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

const s = stylex.create({
  nav: {
    position: "sticky",
    top: sizes.headerHeight,
    alignSelf: "start",
    display: { default: null, [when.print]: "none" },
    height: `calc(100dvh - ${sizes.headerHeight})`,
    overflowY: "auto",
    overscrollBehavior: "contain",
    paddingBlock: `${space.xl2} ${space.xl3}`,
    paddingInline: `${space.lg} ${space.xl}`,
    borderRightWidth: 1,
    borderRightStyle: "solid",
    borderRightColor: theme.border,
    scrollbarWidth: "thin",
  },
  drawer: {
    position: "fixed",
    zIndex: layer.drawer,
    top: sizes.headerHeight,
    left: 0,
    width: "min(320px, 86vw)",
    backgroundColor: theme.surface,
    boxShadow: theme.shadowOverlay,
  },
  label: {
    margin: 0,
    marginBottom: space.md,
    paddingInline: space.md,
    color: theme.textMuted,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    letterSpacing: letterSpacing.caps,
    textTransform: "uppercase",
  },
  list: {
    margin: 0,
    padding: 0,
    listStyle: "none",
  },
  page: {
    display: "flex",
    gap: space.md,
    alignItems: "baseline",
    paddingBlock: space.sm,
    paddingInline: space.md,
    borderRadius: radius.md,
    color: { default: theme.textMuted, ":hover": theme.text },
    backgroundColor: { default: "transparent", ":hover": theme.surfaceRaised },
    fontSize: fontSize.sm,
    lineHeight: lineHeight.snug,
    textDecoration: "none",
    transitionProperty: "background-color, color",
    transitionDuration: duration.fast,
  },
  pageActive: {
    color: { default: theme.text, ":hover": theme.text },
    backgroundColor: { default: theme.surfaceRaised, ":hover": theme.surfaceRaised },
    fontWeight: fontWeight.semibold,
  },
  pageNumber: {
    minWidth: space.md,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    fontVariantNumeric: "tabular-nums",
  },
  sections: {
    marginBlock: `${space.xs} ${space.sm}`,
    marginInlineStart: space.xl,
    padding: 0,
    listStyle: "none",
    borderLeftWidth: 1,
    borderLeftStyle: "solid",
    borderLeftColor: theme.border,
  },
  section: {
    display: "block",
    marginLeft: -1,
    paddingBlock: space.xs,
    paddingInline: `${space.md} ${space.sm}`,
    borderLeftWidth: 2,
    borderLeftStyle: "solid",
    borderLeftColor: "transparent",
    color: { default: theme.textMuted, ":hover": theme.text },
    fontSize: fontSize.sm,
    lineHeight: lineHeight.snug,
    textDecoration: "none",
  },
  sectionActive: {
    color: { default: theme.accentStrong, ":hover": theme.accentStrong },
    borderLeftColor: theme.accent,
  },
});
