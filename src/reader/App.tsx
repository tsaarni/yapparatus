import {
  contentDir,
  type DocumentPage,
  logo as Logo,
  onPagesChanged,
  pages,
  settings,
} from "virtual:yapparatus/document";
import * as stylex from "@stylexjs/stylex";
import {
  type CSSProperties,
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { flashPart } from "../diagram/Diagram.tsx";
import { partSeparator, splitAddress, textFragment } from "../document.ts";
import { type FileAddress, fileAddress, parseFileAddress } from "../files.ts";
import type { ContextItem, ReportedDiagnostic } from "../protocol.ts";
import { useLive } from "./api.ts";
import { type ThemeChoice, themeSwitchable, useThemeChoice } from "./appearance.ts";
import { Chat } from "./Chat.tsx";
import { DiagnosticsMenu, PageBoundary } from "./diagnostics.tsx";
import { FileView } from "./FileView.tsx";
import { AppIcon as Icon } from "./icons.tsx";
import { numbering, numbersOf, PageContext } from "./numbering.ts";
import { ReadingContext } from "./prose.tsx";
import { components } from "./registry.ts";
import {
  addressHref,
  canonicalize,
  fileHref,
  hashMode,
  href,
  interceptLinks,
  navigate,
  parseAddress,
  scrollToFragment,
  useRoute,
} from "./router.ts";
import { Sidebar } from "./Sidebar.tsx";
import {
  codeAddress,
  contextFromDiagram,
  contextFromTarget,
  contextsFromRange,
  fileContextsFromRange,
  relocateLines,
  selectedCode,
  useSelectionMenu,
} from "./selection.ts";
import { TargetContext, type TargetHandlers } from "./targets.tsx";
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
import { Button, styled, ui, useCopy } from "./ui.tsx";

const live = import.meta.env.DEV;
export const documentTitle = settings.title ?? humanize(contentDir.split("/").at(-1) ?? contentDir);

function humanize(name: string) {
  const words = name.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

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

export function App() {
  const route = useRoute();
  const page = route.page;
  const file = route.file;
  const { chat, diagnostics } = useLive();
  // Bumped when an edited page is updated in place, so the page and the numbers re-render.
  const [pagesRevision, setPagesRevision] = useState(0);
  useEffect(() => onPagesChanged(() => setPagesRevision((revision) => revision + 1)), []);
  const [open, setOpen] = useStored("yapparatus:open", false);
  const [context, setContext] = useStored<ContextItem[]>("yapparatus:context", []);
  const [question, setQuestion] = useStored("yapparatus:draft", "");
  const [full, setFull] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [layout, setLayout] = useState<Layout>("wide");
  const [panelWidth, setPanelWidth] = useState<number>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<{ text: string; id: number }>();
  const appRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const selection = useSelectionMenu(true);
  const [pendingShow, setPendingShow] = useState<ContextItem>();
  const chatOpen = live && open;

  useLayoutEffect(() => canonicalize(), []);
  useEffect(() => {
    document.addEventListener("click", interceptLinks);
    return () => document.removeEventListener("click", interceptLinks);
  }, []);
  useEffect(() => {
    document.title = [file?.path ?? page?.outline.title, documentTitle, settings.subtitle]
      .filter(Boolean)
      .join(" · ");
  }, [page, file]);
  // After a route change: restore the old position on Back, else go to the anchor or top.
  useLayoutEffect(() => {
    if (route.restore !== undefined) window.scrollTo({ top: route.restore });
    else {
      scrollToFragment(route.fragment, false);
      // Arriving at an address shows where it points. Diagrams render after their fonts
      // load, so their parts may appear a moment later. The file view shows its own lines.
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
  useEffect(() => {
    const app = appRef.current;
    if (!app) return;
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

  const addContext = useCallback(
    (items: ContextItem[]) => {
      setContext((current) => [
        ...current,
        ...items.filter((item) => !current.some((c) => JSON.stringify(c) === JSON.stringify(item))),
      ]);
      setOpen(true);
    },
    [setContext, setOpen],
  );

  /** Attach the place a diagnostic is about to the message box, and start the question. */
  function askAbout(diagnostic: ReportedDiagnostic) {
    const target = pages.find((p) => p.source === diagnostic.source);
    if (!target) return;
    setOpen(true);
    setQuestion(
      `Please fix this ${diagnostic.severity}: ${diagnostic.code}${
        diagnostic.line ? ` on line ${diagnostic.line}` : ""
      }: ${diagnostic.message}`,
    );
    const anchor = diagnostic.origin === "diagram" ? (diagnostic.target ?? "") : "";
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
        const item = contextFromTarget(element, target);
        if (item) addContext([item]);
      },
    );
  }

  /** Find the target of an earlier context item, by its source hash and address, and show it. */
  function showOnPage(item: ContextItem) {
    const sourceFile = parseFileAddress(item.address);
    if (sourceFile) return showLinesOnPage(item, sourceFile);
    const { page: target, fragment } = parseAddress(item.address);
    if (target && target !== page) {
      setPendingShow(item);
      navigate(href(target, fragment));
      return;
    }
    whenPresent(
      () => {
        const found = findTarget(item);
        return found.length === 1 ? found[0] : undefined;
      },
      (element) => {
        element.scrollIntoView({ block: "center", behavior: "smooth" });
        flash(element);
      },
      () => {
        // The exact target is gone, usually because the agent rewrote it in answer. Its anchor,
        // the section around selected text or the figure around a part, is a sure place to look.
        const { anchor } = splitAddress(item.address);
        const around =
          (anchor && document.getElementById(anchor)) ||
          (anchor.includes(partSeparator) &&
            document.getElementById(anchor.slice(0, anchor.indexOf(partSeparator))));
        if (!around) {
          setNotice({ text: "This part disappeared or is ambiguous.", id: Date.now() });
          return;
        }
        around.scrollIntoView({ block: "start", behavior: "smooth" });
        flash(around);
        setNotice({
          text:
            item.kind === "text" || item.kind === "diagram-part"
              ? `This ${item.kind === "text" ? "text" : "part"} changed since you asked. Showing where it was.`
              : "This changed since you asked. Showing it as it is now.",
          id: Date.now(),
        });
      },
    );
  }
  /**
   * Open a source file at an earlier item's lines. When the file changed, find the lines by
   * their hash and go there instead; with no single match, say so.
   */
  function showLinesOnPage(item: ContextItem, target: FileAddress) {
    navigate(fileHref(target));
    if (item.kind !== "lines") return;
    const whole = fileAddress({ folder: target.folder, path: target.path });
    const changed = () =>
      setNotice({ text: "These lines changed or disappeared.", id: Date.now() });
    whenPresent(
      () =>
        document.querySelector<HTMLElement>(
          `main article [data-file="${CSS.escape(whole)}"]:has([data-line])`,
        ),
      (region) =>
        void relocateLines(region, item).then((lines) => {
          if (!lines) changed();
          else if (lines.start !== item.startLine)
            navigate(fileHref({ ...target, lines }), { replace: true });
        }),
      changed,
      30,
    );
  }
  // biome-ignore lint/correctness/useExhaustiveDependencies: Run once the page arrives.
  useEffect(() => {
    if (!pendingShow || !page) return;
    setPendingShow(undefined);
    showOnPage(pendingShow);
  }, [page, pendingShow]);

  // Stable, so typing a question does not re-render the page through this context.
  const handlers = useMemo<TargetHandlers>(
    () => ({
      link: (element) => {
        const target = element.closest<HTMLElement>("[data-target]");
        if (!target?.id || !page) return;
        return new URL(href(page, target.id), location.href).href;
      },
      ...(live
        ? {
            ask: (element: Element) => {
              const item = page && contextFromTarget(element, page);
              if (item) addContext([item]);
            },
          }
        : {}),
    }),
    [page, addContext],
  );

  const wide = layout === "wide";
  const chapter = page && numbering.sections ? numbersOf(page)?.chapter : undefined;
  return (
    <div
      ref={appRef}
      data-layout={layout}
      {...styled(
        `app ${chatOpen ? "with-chat" : ""} ${full ? "chat-full" : ""}`,
        s.app,
        chatOpen && s.withChat,
      )}
      style={panelWidth ? ({ "--chat-width": `${panelWidth}px` } as CSSProperties) : undefined}
    >
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
            <a href={pages[0] ? href(pages[0]) : "/"} {...stylex.props(s.home, ui.focus)}>
              {Logo && (
                // As tall as the two-line lockup beside it, from the subtitle's cap height to
                // the title's baseline.
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
            {live && <DiagnosticsMenu diagnostics={diagnostics} onAsk={askAbout} />}
            {live && (
              <Button
                className="ask-action"
                variant={open ? "default" : "primary"}
                aria-pressed={open}
                onClick={() => setOpen(!open)}
              >
                <Icon name="ask" /> Ask
              </Button>
            )}
          </div>
        </div>
      </header>

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
                    const item = page && contextFromDiagram(event.target, page);
                    if (item) addContext([item]);
                  }
                : undefined
            }
            onKeyDown={
              live
                ? (event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    const item = page && contextFromDiagram(event.target, page);
                    if (!item) return;
                    event.preventDefault();
                    addContext([item]);
                  }
                : undefined
            }
          >
            {file ? (
              <FileView
                file={file}
                fragment={route.fragment}
                {...(live ? { onAsk: addContext } : {})}
              />
            ) : (
              <>
                <PageContent page={page} handlers={handlers} revision={pagesRevision} />
                <PageFooter page={page} />
              </>
            )}
          </article>
        </main>
      </div>

      {selection.menu && (page || file) && (
        <div
          role="toolbar"
          aria-label="Selection actions"
          {...styled("selection-menu", s.selectionMenu)}
          style={{ left: selection.menu.x, top: selection.menu.y }}
        >
          {live && (
            <Button
              variant="ghost"
              size="small"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                const range = selection.menu?.range;
                if (range) {
                  const text = page ? contextsFromRange(range, page) : [];
                  void fileContextsFromRange(range).then((lines) =>
                    addContext([...text, ...lines]),
                  );
                }
                window.getSelection()?.removeAllRanges();
                selection.dismiss();
              }}
            >
              <Icon name="ask" size={14} /> Ask
            </Button>
          )}
          <CopyPassageLink
            link={() => {
              const range = selection.menu?.range;
              const item = range && page && contextsFromRange(range, page)[0];
              if (!item || !page) {
                // Selected code links to its lines in the file, and to its words when it leaves
                // out part of them, which browsers highlight. The single file links the lines.
                const [code] = range ? selectedCode(range) : [];
                const address = code && codeAddress(hashMode ? { ...code, words: "" } : code);
                return address && new URL(addressHref(address), location.href).href;
              }
              const { fragment } = parseAddress(item.address);
              // Text fragments need a real URL; the single file can only link the section.
              const directive = hashMode ? "" : textFragment(range.toString());
              const link = `${href(page, fragment)}${fragment ? "" : "#"}${directive}`;
              return new URL(link, location.href).href;
            }}
            dismiss={selection.dismiss}
          />
        </div>
      )}

      {chatOpen && (
        <Chat
          chat={chat}
          context={context}
          setContext={setContext}
          question={question}
          setQuestion={setQuestion}
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

      <div {...styled("notifications", s.notifications)} aria-live="polite">
        {notice && (
          <Notice key={notice.id} text={notice.text} onDismiss={() => setNotice(undefined)} />
        )}
        {error && (
          <p {...stylex.props(s.toast, s.toastError)} role="alert">
            {error}
            <Button size="small" variant="ghost" onClick={() => setError("")}>
              Dismiss
            </Button>
          </p>
        )}
      </div>
    </div>
  );
}

const themeNames: Record<ThemeChoice, string> = { system: "System", light: "Light", dark: "Dark" };
const nextTheme: Record<ThemeChoice, ThemeChoice> = {
  system: "light",
  light: "dark",
  dark: "system",
};

/** Cycles the theme: the system's setting, light, dark. Shown when the document allows it. */
function ThemeButton() {
  const [choice, setChoice] = useThemeChoice();
  const label = `Theme: ${themeNames[choice]}. Switch to ${themeNames[nextTheme[choice]]}`;
  return (
    <Button
      className="theme-switch"
      variant="icon"
      aria-label={label}
      title={label}
      onClick={() => setChoice(nextTheme[choice])}
    >
      <Icon name={choice} />
    </Button>
  );
}

/**
 * The selection menu's Copy link. It confirms on the button, then the menu closes, so the
 * reader sees the copy happen without a notice to dismiss.
 */
function CopyPassageLink({
  link,
  dismiss,
}: {
  link: () => string | undefined;
  dismiss: () => void;
}) {
  const [copied, copy] = useCopy();
  return (
    <Button
      variant="ghost"
      size="small"
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        const url = link();
        if (!url) return dismiss();
        void copy(url).then(() => window.setTimeout(dismiss, 700));
      }}
    >
      <Icon
        name={copied === "copied" ? "check" : copied === "failed" ? "close" : "link"}
        size={14}
      />
      {copied === "copied"
        ? "Copied"
        : copied === "failed"
          ? "Clipboard not available"
          : "Copy link"}
    </Button>
  );
}

/**
 * A notice tells the reader something and goes away by itself: after a few seconds, on
 * Escape, or on Dismiss. Pointing at it holds it open. Errors stay until dismissed.
 */
function Notice({ text, onDismiss }: { text: string; onDismiss: () => void }) {
  const [held, setHeld] = useState(false);
  // The parent passes a new function each render; the timer must not restart with it.
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  useEffect(() => {
    if (held) return;
    const timer = window.setTimeout(() => dismiss.current(), 4000);
    return () => window.clearTimeout(timer);
  }, [held]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <p
      {...styled("notice", s.toast)}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
    >
      {text}
      <Button size="small" variant="ghost" onClick={onDismiss}>
        Dismiss
      </Button>
    </p>
  );
}

/** The elements on the page that an earlier context item points at. */
function findTarget(item: ContextItem): Element[] {
  const blocks = [...document.querySelectorAll<HTMLElement>("main article [data-source]")].filter(
    (block) => block.dataset.source === item.source && block.dataset.hash === item.hash,
  );
  const { anchor, text } = splitAddress(item.address);
  const flat = (words: string | null | undefined) => (words ?? "").replace(/\s+/g, " ");
  if (item.kind === "text")
    return blocks.filter((block) => {
      const content = flat(block.textContent);
      return !!text && content.includes(text.start) && content.includes(text.end ?? "");
    });
  if (item.kind === "diagram-part") {
    const part = anchor.slice(anchor.indexOf(partSeparator) + partSeparator.length);
    return blocks.flatMap((b) => [
      ...b.querySelectorAll(`[data-element-id="${CSS.escape(part)}"]`),
    ]);
  }
  return blocks.flatMap((b) => [...b.querySelectorAll(`[data-target="${item.kind}"]`)]);
}

/** Run `found` once `find` returns an element, retrying briefly while diagrams render. */
function whenPresent<T extends Element>(
  find: () => T | null | undefined,
  found: (element: T) => void,
  missing?: () => void,
  tries = 12,
) {
  const element = find();
  if (element) found(element);
  else if (tries > 0) window.setTimeout(() => whenPresent(find, found, missing, tries - 1), 100);
  else missing?.();
}

/** Briefly mark a target the reader just arrived at. */
function flash(element: Element) {
  if (element instanceof SVGElement) return flashPart(element);
  const classes = stylex.props(s.highlight).className?.split(" ") ?? [];
  element.classList.add(...classes);
  window.setTimeout(() => element.classList.remove(...classes), 1800);
}

/** The page reads as page text, not as a chat reply. */
const reading = { reply: false, idPrefix: "" };

/**
 * The page itself. Memoized on stable inputs: typing a question or selecting text changes
 * the app's state, and must not re-render the page and recompile every diagram on it.
 */
const PageContent = memo(function PageContent({
  page,
  handlers,
}: {
  page: DocumentPage | undefined;
  handlers: TargetHandlers;
  /** Changes when a page is updated in place, so the memoized content renders again. */
  revision: number;
}) {
  const Page = page?.default;
  return (
    <TargetContext.Provider value={handlers}>
      <PageContext.Provider value={page}>
        <ReadingContext.Provider value={reading}>
          {page && Page ? (
            <PageBoundary key={page.source} source={page.source} revision={page.outline?.revision}>
              <Page components={components} />
            </PageBoundary>
          ) : (
            <NotFound />
          )}
        </ReadingContext.Provider>
      </PageContext.Provider>
    </TargetContext.Provider>
  );
});

function NotFound() {
  return (
    <div {...stylex.props(s.notFound)}>
      <h1 {...stylex.props(s.notFoundTitle)}>Page not found</h1>
      <p>
        {pages[0] ? (
          <>
            Nothing lives at this address.{" "}
            <a href={href(pages[0])} {...stylex.props(s.link, ui.focus)}>
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

/** Previous and next page, at the end of every page. */
function PageFooter({ page }: { page: DocumentPage | undefined }) {
  const index = page ? pages.indexOf(page) : -1;
  if (index < 0) return null;
  const previous = pages[index - 1];
  const next = pages[index + 1];
  return (
    <nav aria-label="Previous and next page" {...stylex.props(s.pager)}>
      {previous ? (
        <a href={href(previous)} {...stylex.props(s.pagerLink, ui.focus)}>
          <span {...stylex.props(s.pagerLabel)}>← Previous</span>
          {previous.outline.title}
        </a>
      ) : (
        <span />
      )}
      {next && (
        <a href={href(next)} {...stylex.props(s.pagerLink, s.pagerNext, ui.focus)}>
          <span {...stylex.props(s.pagerLabel)}>Next →</span>
          {next.outline.title}
        </a>
      )}
    </nav>
  );
}

const s = stylex.create({
  app: {
    minHeight: "100dvh",
  },
  withChat: {
    marginRight: {
      default: `var(--chat-width, ${sizes.chatWidth})`,
      [when.smallScreen]: 0,
      [when.print]: 0,
    },
  },
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
  notFound: { gridColumn: "content" },
  notFoundTitle: { color: theme.text },
  link: { color: theme.accentStrong },
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
  selectionMenu: {
    position: "fixed",
    zIndex: layer.popover,
    display: { default: null, [when.print]: "none" },
    padding: space.xxs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: theme.borderStrong,
    backgroundColor: theme.surfaceRaised,
    boxShadow: theme.shadowRaised,
  },
  highlight: {
    outlineWidth: 2,
    outlineStyle: "solid",
    outlineColor: theme.accentStrong,
    outlineOffset: space.sm,
    borderRadius: radius.sm,
  },
  notifications: {
    position: "fixed",
    zIndex: layer.toast,
    bottom: space.xl,
    left: "50%",
    transform: "translateX(-50%)",
    display: { default: "grid", [when.print]: "none" },
    gap: space.sm,
    width: `min(${sizes.textWidth}, calc(100vw - ${space.xl2}))`,
    pointerEvents: "none",
  },
  toast: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
    margin: 0,
    paddingBlock: space.sm,
    paddingInline: `${space.lg} ${space.sm}`,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: theme.borderStrong,
    backgroundColor: theme.surfaceRaised,
    boxShadow: theme.shadowRaised,
    color: theme.text,
    fontSize: fontSize.sm,
    pointerEvents: "auto",
  },
  toastError: { color: theme.error, borderColor: theme.errorBorder },
});
