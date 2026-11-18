/** The header bar across the top of the app. */

import {
  contentDir,
  type DocumentPage,
  logo as Logo,
  pages,
  settings,
} from "virtual:yapparatus/document";
import * as stylex from "@stylexjs/stylex";
import type { FileAddress } from "../../document/file-address.ts";
import type { ReportedDiagnostic } from "../../protocol/rest-api.ts";
import { numbering, numbersOf } from "../addressing/numbering.ts";
import { href } from "../addressing/router.ts";
import { AppIcon as Icon } from "../controls/app-icon.tsx";
import { Button } from "../controls/button.tsx";
import { focus } from "../style/focus.ts";
import { styled } from "../style/styled.ts";
import {
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
} from "../style/theme.stylex.ts";
import { themeSwitchable } from "./appearance.ts";
import { DiagnosticsMenu } from "./diagnostics-menu.tsx";
import { ThemeButton } from "./theme-button.tsx";

const live = import.meta.env.DEV;

/** The document's name: its `title` setting, or the name of its directory. */
export const documentTitle = settings.title ?? humanize(contentDir.split("/").at(-1) ?? contentDir);

/** A directory name as a title: dashes and underscores become spaces, first letter capitalized. */
function humanize(name: string) {
  const words = name.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The header: the contents button in the compact layout, the document's name, the current page
 * in the wide layout, and the theme, diagnostics, and Chat buttons.
 */
export function Header({
  wide,
  drawer,
  setDrawer,
  page,
  file,
  diagnostics,
  commentOn,
  open,
  setOpen,
}: {
  wide: boolean;
  drawer: boolean;
  setDrawer: (drawer: boolean) => void;
  page: DocumentPage | undefined;
  file: FileAddress | undefined;
  diagnostics: ReportedDiagnostic[];
  commentOn: (diagnostic: ReportedDiagnostic) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const chapter = page && numbering.sections ? numbersOf(page)?.chapter : undefined;
  return (
    <header {...styled("masthead", s.header)}>
      <div {...stylex.props(s.headerInner, wide && s.headerWide)}>
        <div {...stylex.props(s.headerStart)}>
          {!wide && (
            <Button
              variant="icon"
              aria-label={drawer ? "Close contents" : "Open contents"}
              aria-expanded={drawer}
              onClick={() => setDrawer(!drawer)}
            >
              <Icon name={drawer ? "close" : "menu"} />
            </Button>
          )}
          <a href={pages[0] ? href(pages[0]) : "/"} {...stylex.props(s.home, focus.ring)}>
            {Logo && (
              <span {...styled("logo", s.mark)}>
                <Logo width={28} height={28} aria-hidden="true" focusable="false" />
              </span>
            )}
            <span {...stylex.props(s.lockup)}>
              {settings.subtitle && (
                <span {...styled("subtitle", s.subtitle)}>{settings.subtitle}</span>
              )}
              <span {...styled("document-title", s.title)} title={documentTitle}>
                {documentTitle}
              </span>
            </span>
          </a>
        </div>
        {wide && page && (
          <p {...stylex.props(s.crumb)}>
            {chapter && <span {...stylex.props(s.crumbNumber)}>{chapter}</span>}
            {page.outline.title}
          </p>
        )}
        {wide && file && (
          <p {...stylex.props(s.crumb)}>
            {file.folder}/{file.path}
          </p>
        )}
        <div {...stylex.props(s.headerEnd)}>
          {themeSwitchable && <ThemeButton />}
          {live && <DiagnosticsMenu diagnostics={diagnostics} onComment={commentOn} />}
          {live && (
            <Button
              className="chat-action"
              variant={open ? "default" : "primary"}
              aria-pressed={open}
              onClick={() => setOpen(!open)}
            >
              <Icon name="comment" /> Chat
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

const s = stylex.create({
  header: {
    position: "sticky",
    zIndex: layer.header,
    top: 0,
    display: { default: null, [when.print]: "none" },
    height: sizes.headerHeight,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: theme.border,
    backgroundColor: `color-mix(in srgb, ${theme.canvas} 85%, transparent)`,
    backdropFilter: "saturate(140%) blur(12px)",
  },
  headerInner: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    alignItems: "center",
    height: "100%",
    maxWidth: sizes.pageMaxWidth,
    marginInline: "auto",
    paddingInline: space.lg,
  },
  headerWide: {
    gridTemplateColumns: `calc(${sizes.sidebarWidth} - ${space.lg}) minmax(0, 1fr) auto`,
    columnGap: sizes.gutter,
    paddingInline: `${space.lg} ${space.xl}`,
  },
  headerStart: {
    display: "flex",
    alignItems: "center",
    gap: space.xs,
    minWidth: 0,
  },
  home: {
    display: "flex",
    alignItems: "center",
    gap: space.md,
    minWidth: 0,
    paddingBlock: space.xs,
    paddingInline: space.sm,
    borderRadius: radius.md,
    textDecoration: "none",
  },
  mark: {
    display: "inline-flex",
    flexShrink: 0,
    color: theme.accent,
  },
  lockup: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    lineHeight: lineHeight.tight,
  },
  subtitle: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    color: theme.textMuted,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  title: {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    color: theme.text,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    letterSpacing: letterSpacing.snug,
  },
  crumb: {
    minWidth: 0,
    margin: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    color: theme.textMuted,
    fontSize: fontSize.sm,
  },
  crumbNumber: {
    marginRight: space.sm,
    fontVariantNumeric: "tabular-nums",
  },
  headerEnd: {
    display: "flex",
    alignItems: "center",
    gap: space.sm,
  },
});
