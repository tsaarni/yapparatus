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
import { resolveLink, splitAddress } from "../document.ts";
import { type FileAddress, fileAddress, filesPrefix, parseFileAddress } from "../files.ts";

const base = import.meta.env.BASE_URL.replace(/\/$/, "");
export const hashMode = __YAPPARATUS_HASH_ROUTES__ || location.protocol === "file:";
const changed = "yapparatus:navigate";

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

function parse(): { slug: string; fragment: string } {
  if (hashMode) {
    const [slug = "", ...rest] = location.hash.replace(/^#\/?/, "").split("#");
    return { slug, fragment: decodeURIComponent(rest.join("#")) };
  }
  const slug = decodeURIComponent(location.pathname)
    .slice(base.length)
    .replace(/(^|\/)index\.html$/, "")
    .replace(/^\/+|\/+$/g, "");
  return { slug, fragment: decodeURIComponent(location.hash.slice(1)) };
}

let cache: { key: string; route: Route } | undefined;
let restore: number | undefined;

function snapshot(): Route {
  const key = `${location.pathname}${location.hash}`;
  if (cache?.key === key) return cache.route;
  const { slug, fragment } = parse();
  const file = parseFileAddress(`/${slug}`);
  const page = file ? undefined : slug ? pages.find((p) => p.id === slug) : pages[0];
  const route: Route = {
    page,
    ...(file ? { file } : {}),
    fragment,
    ...(restore !== undefined ? { restore } : {}),
  };
  restore = undefined;
  cache = { key, route };
  return route;
}

function subscribe(notify: () => void) {
  const pop = (event: PopStateEvent) => {
    const scroll = (event.state as { scroll?: unknown } | null)?.scroll;
    restore = typeof scroll === "number" ? scroll : undefined;
    notify();
  };
  window.addEventListener("popstate", pop);
  window.addEventListener("hashchange", notify);
  window.addEventListener(changed, notify);
  return () => {
    window.removeEventListener("popstate", pop);
    window.removeEventListener("hashchange", notify);
    window.removeEventListener(changed, notify);
  };
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, snapshot);
}

/** Go to an address produced by `href`. Remembers the scroll position for Back. */
export function navigate(to: string, { replace = false } = {}) {
  history.replaceState({ ...(history.state as object), scroll: window.scrollY }, "");
  if (replace) history.replaceState({}, "", to);
  else history.pushState({}, "", to);
  window.dispatchEvent(new Event(changed));
}

/**
 * The stable address of a target, independent of how the app routes: "/page#anchor".
 * Context items, prompts, and Show on page use it; `href` turns it into a link.
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
  const { slug, fragment } = parse();
  const first = pages[0];
  if (!slug && first) history.replaceState(history.state, "", href(first, fragment));
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

/** Handle clicks on internal links without reloading the app. */
export function interceptLinks(event: MouseEvent) {
  if (event.defaultPrevented || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const anchor = (event.target as Element | null)?.closest?.("a[href]");
  if (!(anchor instanceof HTMLAnchorElement)) return;
  if (anchor.target && anchor.target !== "_self") return;
  if (anchor.hasAttribute("download")) return;
  const url = new URL(anchor.href);
  if (url.origin !== location.origin && location.protocol !== "file:") return;
  const raw = anchor.getAttribute("href") ?? "";
  if (hashMode ? !raw.startsWith("#/") : !url.pathname.startsWith(`${base}/`)) return;
  if (!hashMode) {
    const slug = url.pathname.slice(base.length).replace(/^\/+|\/+$/g, "");
    const known =
      pages.some((p) => p.id === slug) || url.pathname.startsWith(`${base}${filesPrefix}/`);
    if (slug && !known) return;
  }
  const target = hashMode ? raw : `${url.pathname}${url.hash}`;
  if (target === (hashMode ? location.hash : `${location.pathname}${location.hash}`)) {
    // The same address again: scroll to its anchor without a new history entry.
    event.preventDefault();
    scrollToFragment(parse().fragment);
    return;
  }
  event.preventDefault();
  navigate(target);
}

/** Scroll to an anchor, or to the top when there is none. */
export function scrollToFragment(fragment: string, smooth = true) {
  const target = fragment ? document.getElementById(fragment) : undefined;
  // Diagram parts are SVG and ignore scroll margins; center them instead.
  const block = target instanceof SVGElement ? "center" : "start";
  if (target) target.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block });
  else if (!fragment) window.scrollTo({ top: 0 });
}
