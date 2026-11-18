/**
 * A small router for document pages and the source files they show.
 *
 * Path mode (live and static site): /key-ideas#fingerprint, /-/files/app/main.go#L4-L9
 * Hash mode (single HTML file, which has no server): #/key-ideas#fingerprint
 *
 * A page's path is its id: the file name inside the content folder, without `.mdx`. Fragments are
 * heading or figure anchors, exactly as written in the page, or a file's lines.
 */

import { type DocumentPage, pages } from "virtual:yapparatus/document";
import { useSyncExternalStore } from "react";
import { resolveLink, splitAddress } from "../../document/address.ts";
import { type FileAddress, fileAddress, parseFileAddress } from "../../document/file-address.ts";

const base = import.meta.env.BASE_URL.replace(/\/$/, "");
export const hashMode = __YAPPARATUS_HASH_ROUTES__ || location.protocol === "file:";

export interface Route {
  /** The page, or undefined when the address names no page. */
  page: DocumentPage | undefined;
  /** The source file, without lines, when the address names one. */
  file?: FileAddress;
  /** Anchor inside the page, without "#". */
  fragment: string;
  /** Set after back/forward: the scroll position to restore. */
  restore?: number;
}

/** The address of a page, optionally at an anchor. */
export function href(page: DocumentPage, fragment = ""): string {
  const frag = fragment ? `#${fragment}` : "";
  return hashMode ? `#/${page.id}${frag}` : `${base}/${page.id}${frag}`;
}

/** The link to an address, "/page#id" or "/-/files/app/x.ts#L4", as this build routes it. */
export function addressHref(address: string): string {
  return hashMode ? `#${address}` : `${base}${address}`;
}

/** The link to a source file, or to lines in it. */
export function fileHref(file: FileAddress): string {
  return addressHref(fileAddress(file));
}

/** The page slug and fragment a URL names, as this build routes it. */
function parse(url: URL): { slug: string; fragment: string } {
  if (hashMode) {
    const [slug = "", ...rest] = url.hash.replace(/^#\/?/, "").split("#");
    return { slug, fragment: decodeURIComponent(rest.join("#")) };
  }
  const slug = decodeURIComponent(url.pathname)
    .slice(base.length)
    .replace(/(^|\/)index\.html$/, "")
    .replace(/^\/+|\/+$/g, "");
  return { slug, fragment: decodeURIComponent(url.hash.slice(1)) };
}

/** Does the app show this URL: a page, a source file, or the start of the document? */
function routed(url: URL): boolean {
  if (url.origin !== location.origin) return false;
  if (hashMode)
    return url.pathname === location.pathname && (!url.hash || url.hash.startsWith("#/"));
  if (url.pathname !== base && !url.pathname.startsWith(`${base}/`)) return false;
  const { slug } = parse(url);
  return !slug || pageAt(slug) !== undefined || parseFileAddress(`/${slug}`) !== undefined;
}

/** The page the address names, if it names one. */
function pageAt(slug: string): DocumentPage | undefined {
  if (parseFileAddress(`/${slug}`)) return;
  return slug ? pages.find((p) => p.id === slug) : pages[0];
}

function routeAt(url: URL, restore?: number): Route {
  const { slug, fragment } = parse(url);
  const file = parseFileAddress(`/${slug}`);
  return {
    page: pageAt(slug),
    ...(file ? { file } : {}),
    fragment,
    ...(restore !== undefined ? { restore } : {}),
  };
}

/** Can the page be shown now: its code has loaded, or failed to, which shows the error? */
const ready = (page: DocumentPage) => page.module !== undefined || page.error !== undefined;

let route = routeAt(new URL(location.href));
const listeners = new Set<() => void>();

function subscribe(notify: () => void) {
  listeners.add(notify);
  return () => listeners.delete(notify);
}

/** The scroll position saved in a history entry's state. */
function savedScroll(state: unknown): number | undefined {
  const scroll = (state as { scroll?: unknown } | undefined)?.scroll;
  return typeof scroll === "number" ? scroll : undefined;
}

/**
 * Every navigation to an address the app shows, by a link, `navigate`, Back, or Forward,
 * stays in the app. A new page is shown once its code has loaded, so the old page stays
 * until then, and the new one renders with its content. The latest navigation wins.
 *
 * The page scrolls in its own element, and the browser resets and restores only the window's
 * scroll position. The web app therefore scrolls the page itself, after the route changes.
 */
function intercept(event: NavigateEvent) {
  if (!event.canIntercept || event.downloadRequest !== null || event.formData) return;
  if (event.navigationType === "reload") return;
  const url = new URL(event.destination.url);
  if (!routed(url)) return;
  const options = { scroll: "manual", focusReset: "manual" } as const;
  if (event.navigationType !== "traverse" && url.href === location.href) {
    // The same address again: scroll to its anchor, in the same history entry.
    event.intercept({ ...options, handler: async () => scrollToFragment(route.fragment) });
    return;
  }
  // Remember the position for Back and Forward to the entry the reader leaves.
  navigation.updateCurrentEntry({ state: { scroll: scrollRoot().scrollTop } });
  const restore =
    event.navigationType === "traverse" ? savedScroll(event.destination.getState()) : undefined;
  event.intercept({
    ...options,
    async handler() {
      const page = pageAt(parse(url).slug);
      if (page && !ready(page)) await page.load().catch(() => undefined);
      if (event.signal.aborted) return;
      route = routeAt(url, restore);
      for (const notify of listeners) notify();
    },
  });
}

// Without the Navigation API, links load each page from the server.
const navigationApi = "navigation" in window;
if (navigationApi) {
  navigation.addEventListener("navigate", intercept);
  import.meta.hot?.dispose(() => navigation.removeEventListener("navigate", intercept));
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, () => route);
}

/** The page on screen, for code outside React. */
export function currentPage(): DocumentPage | undefined {
  return route.page;
}

/**
 * The element the page scrolls in. It ends at the chat's left edge, so the page's scrollbar
 * is drawn there and not beside the chat's own scrollbar at the window's edge.
 */
export function scrollRoot(): HTMLElement {
  return document.querySelector<HTMLElement>("[data-scroll-root]") ?? document.documentElement;
}

/** Go to an address produced by `href`. */
export function navigate(to: string, { replace = false } = {}) {
  if (navigationApi) navigation.navigate(to, { history: replace ? "replace" : "push" });
  else if (replace) location.replace(to);
  else location.assign(to);
}

/**
 * The stable address of a target, independent of how the app routes: "/page#anchor".
 * References, prompts, and Show on page use it; `href` turns it into a link.
 */
export function addressOf(page: DocumentPage, fragment?: string): string {
  return `/${page.id}${fragment ? `#${fragment}` : ""}`;
}

/** The page and fragment an address names. */
export function parseAddress(address: string): {
  page: DocumentPage | undefined;
  fragment: string;
} {
  const { page: slug, anchor } = splitAddress(address);
  return { page: pages.find((p) => p.id === slug), fragment: anchor };
}

/** The canonical address for the current location, such as "/" → "/first-page". */
export function canonicalize() {
  const { slug, fragment } = parse(new URL(location.href));
  const first = pages[0];
  if (!slug && first) history.replaceState(null, "", href(first, fragment));
}

/**
 * Turn a link written in a page into a real address. Accepts:
 * "#anchor", "key-ideas", "key-ideas#anchor", "/key-ideas", "02-key-ideas.mdx", "./02-key-ideas.mdx#anchor".
 * Other links are returned unchanged.
 */
export function resolveHref(raw: string | undefined, from: DocumentPage | undefined): string {
  if (!raw) return "";
  const resolved = resolveLink(
    raw,
    from?.id,
    pages.map((p) => p.id),
  );
  if (resolved === "external" || !resolved) return raw;
  if ("file" in resolved) return fileHref(resolved.file);
  const page = pages.find((p) => p.id === resolved.page);
  return page ? href(page, resolved.fragment) : raw;
}

/**
 * Start loading the page a link goes to when the pointer or focus reaches the link, so the
 * page is usually ready when the link is followed.
 */
export function prefetchLinks(event: Event) {
  const anchor = (event.target as Element | null)?.closest?.("a[href]");
  if (!(anchor instanceof HTMLAnchorElement)) return;
  const url = new URL(anchor.href);
  const page = routed(url) ? pageAt(parse(url).slug) : undefined;
  page?.load().catch(() => undefined);
}

/** Scroll to an anchor, or to the top when there is none. */
export function scrollToFragment(fragment: string, smooth = true) {
  const target = fragment ? document.getElementById(fragment) : undefined;
  // Diagram elements are SVG and ignore scroll margins; center them instead.
  const block = target instanceof SVGElement ? "center" : "start";
  if (target) target.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block });
  else if (!fragment) scrollRoot().scrollTo({ top: 0 });
}
