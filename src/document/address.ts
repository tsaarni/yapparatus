/** Page addresses: a page, an anchor in it, and selected words as a text fragment. */

import { type FileAddress, parseFileAddress } from "./file-address.ts";

/** Separates a figure id from an element inside it in DOM ids and addresses: `system-map--api`. */
export const elementSeparator = "--";

/**
 * The text fragment for selected words, which browsers scroll to and highlight:
 * ":~:text=words", or ":~:text=first,last" with four words each for longer passages.
 */
export function textFragment(words: string): string {
  const list = words.replace(/\s+/g, " ").trim().split(" ");
  const encode = (text: string) => encodeURIComponent(text).replace(/-/g, "%2D");
  if (list.length <= 8) return `:~:text=${encode(list.join(" "))}`;
  return `:~:text=${encode(list.slice(0, 4).join(" "))},${encode(list.slice(-4).join(" "))}`;
}

/** An address split up: "/page#anchor:~:text=start,end" → page, anchor, and the words. */
export function splitAddress(address: string): {
  page: string;
  anchor: string;
  text?: { start: string; end?: string };
} {
  const [location = "", directive] = address.split(":~:");
  const [path = "", ...rest] = location.split("#");
  const page = path.replace(/^\/+|\/+$/g, "");
  const anchor = rest.join("#");
  const words = directive?.startsWith("text=") ? directive.slice(5).split(",") : undefined;
  if (!words?.[0]) return { page, anchor };
  const start = decodeURIComponent(words[0]);
  return {
    page,
    anchor,
    text: words[1] ? { start, end: decodeURIComponent(words[1]) } : { start },
  };
}

/** The words of an address's text fragment, as a reader would quote them. */
export function quoteOf(address: string): string | undefined {
  const { text } = splitAddress(address);
  return text && (text.end ? `${text.start} … ${text.end}` : text.start);
}

export type Resolved =
  | { page: string; fragment: string }
  | { file: FileAddress }
  | "external"
  | undefined;

/**
 * Resolve a link written in a page to a page id and fragment, or to a source file. Accepts
 * "#anchor", "key-ideas", "key-ideas#anchor", "/key-ideas", "key-ideas.mdx",
 * "./key-ideas.mdx#x", and "/-/files/app/main.go#L10-L20".
 */
export function resolveLink(raw: string, from: string | undefined, ids: string[]): Resolved {
  if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(raw)) return "external";
  if (raw.startsWith("/-/")) {
    const file = parseFileAddress(raw);
    return file ? { file } : undefined;
  }
  const [target = "", ...rest] = raw.split("#");
  const fragment = rest.join("#");
  if (!target) return from === undefined ? undefined : { page: from, fragment };
  const clean = target.replace(/^\.\//, "").replace(/^\/+|\/+$/g, "");
  let page: string | undefined;
  if (clean.endsWith(".mdx")) {
    const dir = from?.includes("/") ? from.slice(0, from.lastIndexOf("/") + 1) : "";
    const id = normalize(`${dir}${clean.replace(/\.mdx$/, "")}`);
    page = ids.find((p) => p === id) ?? ids.find((p) => p.split("/").at(-1) === id);
  } else page = ids.find((p) => p === clean);
  return page === undefined ? undefined : { page, fragment };
}

function normalize(path: string) {
  const out: string[] = [];
  for (const segment of path.split("/")) {
    if (segment === "..") out.pop();
    else if (segment && segment !== ".") out.push(segment);
  }
  return out.join("/");
}
