/** The page view: a page's content with its contexts, or Page not found. */

import { contentDir, type DocumentPage, pages } from "virtual:yapparatus/document";
import * as stylex from "@stylexjs/stylex";
import { memo } from "react";
import { PageContext } from "../addressing/numbering.ts";
import { href } from "../addressing/router.ts";
import { TargetContext, type TargetHandlers } from "../addressing/targets.tsx";
import { ReadingContext } from "../prose/contexts.ts";
import { components } from "../registry.ts";
import { focus } from "../style/focus.ts";
import { theme } from "../style/theme.stylex.ts";
import { PageBoundary } from "./page-boundary.tsx";
import { PageFooter } from "./page-footer.tsx";

/** The page reads as page text, not as a chat reply. */
const reading = { reply: false, idPrefix: "" };

/**
 * The page itself. Memoized on stable inputs: typing a message or selecting text changes
 * the app's state, and must not re-render the page and recompile every diagram on it.
 */
export const PageView = memo(function PageView({
  page,
  handlers,
}: {
  page: DocumentPage | undefined;
  handlers: TargetHandlers;
  revision: number;
}) {
  return (
    <TargetContext.Provider value={handlers}>
      <PageContext.Provider value={page}>
        <ReadingContext.Provider value={reading}>
          {page ? (
            <>
              <PageBoundary key={page.source} source={page.source} revision={page.outline.revision}>
                <PageBody page={page} />
              </PageBoundary>
              <PageFooter page={page} />
            </>
          ) : (
            <NotFound />
          )}
        </ReadingContext.Provider>
      </PageContext.Provider>
    </TargetContext.Provider>
  );
});

/**
 * A page's content. The router shows a page once its code has loaded or failed to; a page
 * whose code failed throws the error, for its boundary to show.
 */
function PageBody({ page }: { page: DocumentPage }) {
  if (!page.module) throw page.error ?? new Error(`${page.source} has not loaded.`);
  const { default: Page } = page.module;
  return <Page components={components} />;
}

/** Shown when the address names no page, with a link to the first page. */
function NotFound() {
  return (
    <div {...stylex.props(s.notFound)}>
      <h1 {...stylex.props(s.notFoundTitle)}>Page not found</h1>
      <p>
        {pages[0] ? (
          <>
            Nothing lives at this address.{" "}
            <a href={href(pages[0])} {...stylex.props(s.link, focus.ring)}>
              Go to the first page
            </a>
            .
          </>
        ) : (
          <>
            No pages found in <code>{contentDir}/</code>.
          </>
        )}
      </p>
    </div>
  );
}

const s = stylex.create({
  notFound: { gridColumn: "content" },
  notFoundTitle: { color: theme.text },
  link: { color: theme.accentStrong },
});
