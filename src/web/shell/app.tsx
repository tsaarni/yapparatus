import { onPagesChanged, pages, settings } from "virtual:yapparatus/document";
import * as stylex from "@stylexjs/stylex";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { elementSeparator, splitAddress } from "../../document/address.ts";
import { parseFileAddress } from "../../document/file-address.ts";
import type { Reference } from "../../document/reference.ts";
import type { ReportedDiagnostic } from "../../protocol/rest-api.ts";
import {
  canonicalize,
  fileHref,
  href,
  navigate,
  parseAddress,
  prefetchLinks,
  scrollRoot,
  scrollToFragment,
  useRoute,
} from "../addressing/router.ts";
import {
  referenceFromDiagram,
  referenceFromTarget,
  useSelectionMenu,
} from "../addressing/selection.ts";
import type { TargetHandlers } from "../addressing/targets.tsx";
import { Chat } from "../chat/chat.tsx";
import { useLive } from "../live/client.ts";
import { styled } from "../style/styled.ts";
import { layer, sizes, space, theme, when } from "../style/theme.stylex.ts";
import { FileView } from "../views/file-view.tsx";
import { flash } from "../views/flash.ts";
import { PageView } from "../views/page-view.tsx";
import { findReferenced, whenPresent } from "../views/target-search.ts";
import { documentTitle, Header } from "./header.tsx";
import { Notifications } from "./notifications.tsx";
import { SelectionMenu } from "./selection-menu.tsx";
import { Sidebar } from "./sidebar.tsx";

const live = import.meta.env.DEV;

/** Wide shows the contents beside the page; compact puts them in a drawer. */
type Layout = "wide" | "compact";
/** The width, beside the chat, from which the contents fit beside the page. */
const wideLayout = 1100;
const smallScreen = window.matchMedia(when.smallScreen.replace("@media ", ""));

function useStored<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = sessionStorage.getItem(key);
      return stored === null ? initial : (JSON.parse(stored) as T);
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    sessionStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);
  return [value, setValue] as const;
}

/** Run `task` when the browser is idle; Safari has no idle callback. */
const whenIdle = (task: () => void) =>
  "requestIdleCallback" in window ? requestIdleCallback(task) : setTimeout(task, 500);

export function App() {
  // The router changes the route when the new page's code has loaded, so the route's page
  // renders with its content at once.
  const route = useRoute();
  const page = route.page;
  const file = route.file;
  const { chat, diagnostics } = useLive();
  // Bumped when an edited page is updated in place, so the page and the numbers re-render.
  const [pagesRevision, setPagesRevision] = useState(0);
  useEffect(() => onPagesChanged(() => setPagesRevision((revision) => revision + 1)), []);
  const [open, setOpen] = useStored("yapparatus:open", false);
  const [references, setReferences] = useStored<Reference[]>("yapparatus:references", []);
  const [draft, setDraft] = useStored("yapparatus:draft", "");
  const [full, setFull] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [layout, setLayout] = useState<Layout>("wide");
  const [panelWidth, setPanelWidth] = useState<number>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<{ text: string; id: number }>();
  const appRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const selection = useSelectionMenu(true);
  const [pendingShow, setPendingShow] = useState<Reference>();
  const chatOpen = live && open;

  useLayoutEffect(() => canonicalize(), []);
  useEffect(() => {
    document.addEventListener("pointerover", prefetchLinks);
    document.addEventListener("focusin", prefetchLinks);
    return () => {
      document.removeEventListener("pointerover", prefetchLinks);
      document.removeEventListener("focusin", prefetchLinks);
    };
  }, []);
  useEffect(() => {
    document.title = [file?.path ?? page?.outline.title, documentTitle, settings.subtitle]
      .filter(Boolean)
      .join(" · ");
  }, [page, file]);
  // After a route change: restore the old position on Back, else go to the anchor or top.
  useLayoutEffect(() => {
    if (route.restore !== undefined) scrollRoot().scrollTo({ top: route.restore });
    else {
      scrollToFragment(route.fragment, false);
      // Arriving at an address shows where it points. Diagrams render after their fonts
      // load, so their elements may appear a moment later. The file view shows its own lines.
      if (route.fragment && !route.file)
        whenPresent(
          () => document.getElementById(route.fragment),
          (element) => {
            if (element instanceof SVGElement) element.scrollIntoView({ block: "center" });
            flash(element);
          },
        );
    }
  }, [route]);
  // While the reader reads, load the next page, so following the pager does not wait.
  useEffect(() => {
    const next = page && pages[pages.indexOf(page) + 1];
    if (next) whenIdle(() => next.load().catch(() => undefined));
  }, [page]);
  useEffect(() => {
    const app = appRef.current;
    if (!app) return;
    // Keys such as Page Down scroll the focused element, and the page scrolls in this one.
    // A click on the page focuses it again, since it is the nearest focusable element.
    app.focus({ preventScroll: true });
    const observer = new ResizeObserver(([entry]) => {
      const width = entry?.contentRect.width ?? 0;
      setLayout(width >= wideLayout ? "wide" : "compact");
    });
    observer.observe(app);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (layout === "wide") setDrawer(false);
  }, [layout]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!chatOpen || full || !panel) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry && !smallScreen.matches)
        setPanelWidth(Math.round(entry.borderBoxSize[0]?.inlineSize ?? panel.offsetWidth));
    });
    observer.observe(panel);
    return () => observer.disconnect();
  }, [chatOpen, full]);

  const addReferences = useCallback(
    (items: Reference[]) => {
      setReferences((current) => [
        ...current,
        ...items.filter((item) => !current.some((c) => JSON.stringify(c) === JSON.stringify(item))),
      ]);
      setOpen(true);
    },
    [setReferences, setOpen],
  );

  /** Attach the place a diagnostic is about to the message box, and start the message. */
  function commentOn(diagnostic: ReportedDiagnostic) {
    const target = pages.find((p) => p.source === diagnostic.source);
    if (!target) return;
    setOpen(true);
    setDraft(
      `Please fix this ${diagnostic.severity}: ${diagnostic.code}${
        diagnostic.line ? ` on line ${diagnostic.line}` : ""
      }: ${diagnostic.message}`,
    );
    // A figure's diagnostic names it; a reply's target is its message number.
    const anchor = diagnostic.origin === "reply" ? "" : (diagnostic.target ?? "");
    if (target !== page) navigate(href(target, anchor));
    whenPresent(
      () => {
        const element =
          (anchor && document.getElementById(anchor)) ||
          document.querySelector("main article [data-target=page]");
        const block = element?.closest<HTMLElement>("[data-source]");
        return block?.dataset.source === target.source ? element : undefined;
      },
      (element) => {
        const item = referenceFromTarget(element, target);
        if (item) addReferences([item]);
      },
    );
  }

  /** Find the target of an earlier reference by its address, and show it. */
  function showOnPage(item: Reference) {
    // A source file opens at the item's lines, which the file view highlights.
    const sourceFile = parseFileAddress(item.address);
    if (sourceFile) return navigate(fileHref(sourceFile));
    const { page: target, fragment } = parseAddress(item.address);
    if (target && target !== page) {
      setPendingShow(item);
      navigate(href(target, fragment));
      return;
    }
    whenPresent(
      () => {
        const found = findReferenced(item);
        return found.length === 1 ? found[0] : undefined;
      },
      (element) => {
        element.scrollIntoView({ block: "center", behavior: "smooth" });
        flash(element);
      },
      () => {
        // The exact target is gone, usually because the agent rewrote it in answer. Its anchor,
        // the section around selected text or the figure around an element, is a sure place to look.
        const { anchor } = splitAddress(item.address);
        const around =
          (anchor && document.getElementById(anchor)) ||
          (anchor.includes(elementSeparator) &&
            document.getElementById(anchor.slice(0, anchor.indexOf(elementSeparator))));
        if (!around) {
          setNotice({ text: "This target disappeared or is ambiguous.", id: Date.now() });
          return;
        }
        around.scrollIntoView({ block: "start", behavior: "smooth" });
        flash(around);
        setNotice({
          text:
            item.kind === "text" || item.kind === "diagram-element"
              ? `This ${item.kind === "text" ? "text" : "element"} changed since you commented. Showing where it was.`
              : "This changed since you commented. Showing it as it is now.",
          id: Date.now(),
        });
      },
    );
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: Run once the page arrives.
  useEffect(() => {
    if (!pendingShow || !page) return;
    setPendingShow(undefined);
    showOnPage(pendingShow);
  }, [page, pendingShow]);

  // Stable, so typing a message does not re-render the page through this context.
  const handlers = useMemo<TargetHandlers>(
    () => ({
      link: (element) => {
        const target = element.closest<HTMLElement>("[data-target]");
        if (!target?.id || !page) return;
        return new URL(href(page, target.id), location.href).href;
      },
      ...(live
        ? {
            comment: (element: Element) => {
              const item = page && referenceFromTarget(element, page);
              if (item) addReferences([item]);
            },
          }
        : {}),
    }),
    [page, addReferences],
  );

  const wide = layout === "wide";
  return (
    <div
      ref={appRef}
      data-layout={layout}
      data-scroll-root
      tabIndex={-1}
      {...styled(
        `app ${chatOpen ? "with-chat" : ""} ${full ? "chat-full" : ""}`,
        s.app,
        chatOpen && s.withChat,
      )}
      style={panelWidth ? ({ "--chat-width": `${panelWidth}px` } as CSSProperties) : undefined}
    >
      <Header
        wide={wide}
        drawer={drawer}
        setDrawer={setDrawer}
        page={page}
        file={file}
        diagnostics={diagnostics}
        commentOn={commentOn}
        open={open}
        setOpen={setOpen}
      />

      <div {...stylex.props(s.body, wide && s.bodyWide)}>
        {(wide || drawer) && (
          <Sidebar page={page} drawer={!wide} onNavigate={() => setDrawer(false)} />
        )}
        {drawer && !wide && (
          <button
            type="button"
            aria-label="Close contents"
            tabIndex={-1}
            onClick={() => setDrawer(false)}
            {...stylex.props(s.scrim)}
          />
        )}
        <main {...styled("reading-main", s.main, !wide && s.mainCentered)}>
          <article
            {...styled("article", s.article)}
            onClick={
              live
                ? (event) => {
                    const item = page && referenceFromDiagram(event.target, page);
                    if (item) addReferences([item]);
                  }
                : undefined
            }
            onKeyDown={
              live
                ? (event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    const item = page && referenceFromDiagram(event.target, page);
                    if (!item) return;
                    event.preventDefault();
                    addReferences([item]);
                  }
                : undefined
            }
          >
            {file ? (
              <FileView
                file={file}
                fragment={route.fragment}
                {...(live ? { onComment: addReferences } : {})}
              />
            ) : (
              <PageView page={page} handlers={handlers} revision={pagesRevision} />
            )}
          </article>
        </main>
      </div>

      {selection.menu && (page || file) && (
        <SelectionMenu
          menu={selection.menu}
          dismiss={selection.dismiss}
          page={page}
          onComment={addReferences}
        />
      )}

      {chatOpen && (
        <Chat
          chat={chat}
          references={references}
          setReferences={setReferences}
          draft={draft}
          setDraft={setDraft}
          full={full}
          setFull={setFull}
          onClose={() => setOpen(false)}
          onShowOnPage={(item) => {
            setFull(false);
            showOnPage(item);
          }}
          onError={setError}
          panelRef={panelRef}
        />
      )}

      <Notifications
        notice={notice}
        onDismissNotice={() => setNotice(undefined)}
        error={error}
        onDismissError={() => setError("")}
      />
    </div>
  );
}

const s = stylex.create({
  // The page scrolls here, beside the chat, and not in the window. Print shows it whole.
  app: {
    height: { default: "100dvh", [when.print]: "auto" },
    overflowY: { default: "auto", [when.print]: "visible" },
    outlineStyle: "none",
  },
  withChat: {
    marginRight: {
      default: `var(--chat-width, ${sizes.chatWidth})`,
      [when.smallScreen]: 0,
      [when.print]: 0,
    },
  },
  body: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
    maxWidth: sizes.pageMaxWidth,
    marginInline: "auto",
  },
  bodyWide: {
    gridTemplateColumns: {
      default: `${sizes.sidebarWidth} minmax(0, 1fr)`,
      [when.print]: "minmax(0, 1fr)",
    },
  },
  scrim: {
    position: "fixed",
    zIndex: layer.scrim,
    inset: 0,
    top: sizes.headerHeight,
    borderWidth: 0,
    backgroundColor: theme.scrim,
  },
  /** The reading column is the container that reading styles respond to. */
  main: {
    containerName: "reading",
    containerType: "inline-size",
    minWidth: 0,
    paddingBlock: { default: `${space.xl3} ${space.xl5}`, [when.print]: 0 },
    paddingInline: { default: `${sizes.gutter} ${space.xl2}`, [when.print]: 0 },
  },
  mainCentered: {
    width: "100%",
    maxWidth: `calc(${sizes.textWidth} + ${sizes.breakout} + ${space.xl3})`,
    justifySelf: "center",
    paddingInline: { default: space.xl, [when.print]: 0 },
  },
  /**
   * Text sits in "content" with one shared left edge; wide figures extend to the right
   * into "wide". The breakout track shrinks first, so text keeps its width.
   */
  article: {
    display: "grid",
    // The text track takes its full measure first; only the breakout track gives way.
    gridTemplateColumns: `[content-start] min(100%, ${sizes.textWidth}) [content-end] minmax(0, ${sizes.breakout}) [wide-end] minmax(0, 1fr)`,
    color: theme.textBody,
    overflowWrap: "break-word",
  },
});
