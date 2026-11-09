/** Document model shared by the Vite plugin (Node) and the reader (browser). */

import { type FileAddress, linesLabel, parseFileAddress } from "./files.ts";
import type { DiagnosticCode } from "./protocol.ts";

const pageName = /^[a-z0-9]+(-[a-z0-9]+)*(\/[a-z0-9]+(-[a-z0-9]+)*)*$/;

/** A page's id, its address, from its file in the content folder: "guide/setup.mdx" → "guide/setup". */
export const pageIdOf = (file: string) => file.replace(/\.mdx$/, "");

/**
 * Errors in the page files and the `pages` list in `document.json`, as readable messages.
 * `files` are the page ids on disk; `listed` names the page files, with `.mdx`, in reading order.
 * Names start with a letter or digit, so they never reach the application's paths under `/-/`.
 */
export function checkPages(files: string[], listed: unknown): string[] {
  const problems: string[] = [];
  if (!Array.isArray(listed) || !listed.every((file) => typeof file === "string"))
    return [
      'document.json must list the page files in reading order: { "pages": ["overview.mdx", …] }.',
    ];
  for (const file of listed)
    if (!file.endsWith(".mdx"))
      problems.push(`"pages" in document.json lists "${file}"; name the file: "${file}.mdx".`);
  const ids = listed.filter((file) => file.endsWith(".mdx")).map(pageIdOf);
  for (const id of files) {
    if (!pageName.test(id))
      problems.push(`"${id}.mdx" is not a page name: use lowercase letters, digits, and hyphens.`);
    if (!ids.includes(id)) problems.push(`"${id}.mdx" is missing from "pages" in document.json.`);
  }
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) problems.push(`"${id}.mdx" is listed twice in "pages" in document.json.`);
    else if (!files.includes(id))
      problems.push(`"pages" in document.json lists "${id}.mdx", which does not exist.`);
    seen.add(id);
  }
  return problems;
}

/** The document's appearance: one fixed theme, or light and dark that the reader can switch. */
export const themeSettings = ["dark", "light", "auto"] as const;
export type ThemeSetting = (typeof themeSettings)[number];

/** Errors in the `theme` field of `document.json`, as readable messages. */
export function checkTheme(theme: unknown): string[] {
  if (theme === undefined || themeSettings.includes(theme as ThemeSetting)) return [];
  return [`"theme" in document.json is ${JSON.stringify(theme)}; use "dark", "light", or "auto".`];
}

/** An icon name, as `<Icon>`, `logo`, and `favicon` take it: `collection:icon`. */
export const iconName = /^[a-z0-9-]+:[a-z0-9-]+$/;

/** Errors in the `logo` and `favicon` fields of `document.json`, as readable messages. */
export function checkIcons(settings: { logo?: unknown; favicon?: unknown }): string[] {
  return (["logo", "favicon"] as const).flatMap((field) => {
    const value = settings[field];
    if (value === undefined || (typeof value === "string" && iconName.test(value))) return [];
    return [
      `"${field}" in document.json is ${JSON.stringify(value)}; use an icon name such as "lucide:book-open" or "local:logo".`,
    ];
  });
}

/** Components every page and reply can use without an import. */
export const pageComponents = [
  "Figure",
  "Chart",
  "Diagram",
  "Step",
  "Icon",
  "Ref",
  "Table",
  "Listing",
  "FileTree",
  "Excerpt",
  "Tabs",
  "Columns",
  "Panel",
] as const;

/** Kinds of numbered, titled blocks. Each kind has its own sequence per chapter. */
export const numberedKinds = ["figure", "table", "listing"] as const;
export type NumberedKind = (typeof numberedKinds)[number];

export interface NumberingSettings {
  /** Number pages as chapters and their sections: 3, 3.1, 3.1.2. */
  sections: boolean;
  /** Number captioned figures that have an id: Figure 3.1. */
  figures: boolean;
  /** Number captioned tables that have an id: Table 3.1. */
  tables: boolean;
  /** Number captioned code listings that have an id: Listing 3.1. */
  listings: boolean;
}

/** Reader-facing settings from the content folder's `document.json`. */
export interface DocumentSettings {
  /** Page files in the content folder, with `.mdx`, in reading order. Every page is listed exactly once. */
  pages: string[];
  /** Document title in the header and browser tab. Default: the folder name. */
  title?: string;
  /** Small line above the title, also after it in the browser tab, such as the project. */
  subtitle?: string;
  /** Icon beside the title in the header, as `collection:icon`. Default: none. */
  logo?: string;
  /** Icon in the browser tab, as `collection:icon`. Default: the browser's own. */
  favicon?: string;
  /** Heading above the page list. Default: "Contents". */
  contentsLabel?: string;
  /** Automatic numbering. `true` or `false` sets every kind. Default: true. */
  numbering?: boolean | Partial<NumberingSettings>;
  /**
   * "dark" or "light" fixes the theme. "auto" follows the system's light or dark setting,
   * and the reader can choose either theme in the header. Default: "dark".
   */
  theme?: ThemeSetting;
  /**
   * Folders whose files pages may show, by name, relative to `document.json`:
   * `{ "app": "../app" }`. Pages address them as `/-/files/app/<path>#L10-L20`.
   */
  files?: Record<string, string>;
}

export function numberingOf(settings: DocumentSettings): NumberingSettings {
  const n = settings.numbering ?? true;
  if (typeof n === "boolean") return { sections: n, figures: n, tables: n, listings: n };
  return {
    sections: n.sections ?? true,
    figures: n.figures ?? true,
    tables: n.tables ?? true,
    listings: n.listings ?? true,
  };
}

/** What a page contains, extracted at compile time and exported as `outline`. */
export interface PageOutline {
  /** SHA-256 of the page source. */
  revision: string;
  /** Text of the page's single `#` heading. */
  title: string;
  headings: Array<{ depth: 2 | 3; id: string; text: string }>;
  /** Captioned blocks with an id, in page order. */
  numbered: Array<{ kind: NumberedKind; id: string; caption: string }>;
  /** Every id a link may point at: headings and blocks with an explicit id. */
  anchors: string[];
  /**
   * Outgoing links, excerpts' files, and references, with their source line for link checking.
   * A link also names the section it is in, so a file can list where pages discuss it.
   */
  links: Array<{ href: string; line: number; section?: string }>;
  refs: Array<{ to: string; line: number }>;
}

/* ---------- Addresses ---------- */

/** Separates a figure id from a part inside it in DOM ids and addresses: `system-map--api`. */
export const partSeparator = "--";

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

/** An address's parts: "/page#anchor:~:text=start,end" → page, anchor, and the words. */
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
  for (const part of path.split("/")) {
    if (part === "..") out.pop();
    else if (part && part !== ".") out.push(part);
  }
  return out.join("/");
}

/* ---------- Link checking ---------- */

export interface LinkDiagnostic {
  page: string;
  line: number;
  code: DiagnosticCode;
  /** The link, reference, or id the diagnostic is about. */
  subject: string;
  message: string;
}

/** How many lines a source file has, or why it cannot be shown. */
export type FileLines = (file: FileAddress) => { lines: number } | { error: string };

/**
 * Every internal link and reference must point at something that exists: a page and anchor,
 * or a source file and lines inside it.
 */
export function checkLinks(
  pages: Array<{ id: string; outline: PageOutline }>,
  fileLines: FileLines,
): LinkDiagnostic[] {
  const broken: LinkDiagnostic[] = [];
  const ids = pages.map((p) => p.id);
  const byId = new Map(pages.map((p) => [p.id, p.outline]));
  const numberedOwner = new Map<string, string>();
  for (const page of pages)
    for (const block of page.outline.numbered) {
      const owner = numberedOwner.get(block.id);
      if (owner && owner !== page.id)
        broken.push({
          page: page.id,
          line: 1,
          code: "DUPLICATE_ID",
          subject: block.id,
          message: `The id "${block.id}" is also used in ${owner}.mdx; references to it go there.`,
        });
      else numberedOwner.set(block.id, page.id);
    }
  const anchorExists = (page: string, fragment: string) => {
    if (!fragment || fragment.startsWith(":~:")) return true;
    const anchors = byId.get(page)?.anchors ?? [];
    const [base = ""] = fragment.split(partSeparator);
    return anchors.includes(fragment) || anchors.includes(base);
  };
  for (const page of pages) {
    for (const { href, line } of page.outline.links) {
      const resolved = resolveLink(href, page.id, ids);
      if (resolved === "external") continue;
      if (resolved && "file" in resolved) {
        const found = fileLines(resolved.file);
        const { lines } = resolved.file;
        if ("error" in found)
          broken.push({
            page: page.id,
            line,
            code: "BROKEN_LINK",
            subject: href,
            message: `The link "${href}" names no file it can show: ${found.error}`,
          });
        else if (lines && lines.end > found.lines)
          broken.push({
            page: page.id,
            line,
            code: "BROKEN_LINK",
            subject: href,
            message: `The link "${href}" names lines ${linesLabel(lines)}, but the file has ${found.lines} lines.`,
          });
        continue;
      }
      if (!resolved)
        broken.push({
          page: page.id,
          line,
          code: "BROKEN_LINK",
          subject: href,
          message: href.startsWith("/-/files/")
            ? `The link "${href}" is not a file address. Write /-/files/<directory>/<path>#L10-L20.`
            : `No page matches the link "${href}".`,
        });
      else if (!anchorExists(resolved.page, resolved.fragment))
        broken.push({
          page: page.id,
          line,
          code: "BROKEN_LINK",
          subject: href,
          message: `The link "${href}" names #${resolved.fragment}, which ${resolved.page}.mdx does not have.`,
        });
    }
    for (const { to: written, line } of page.outline.refs) {
      // A diagram part or step is checked by its figure; the diagram checks the rest.
      const [to = ""] = written.split(partSeparator);
      const [slug = "", fragment = ""] = to.slice(1).split("#");
      const exists = to.startsWith("/")
        ? ids.includes(slug) && anchorExists(slug, fragment)
        : numberedOwner.has(to) || (byId.get(page.id)?.anchors ?? []).includes(to);
      if (!exists)
        broken.push({
          page: page.id,
          line,
          code: "BROKEN_REF",
          subject: written,
          message: `<Ref to="${written}" /> points at nothing.`,
        });
    }
  }
  return broken;
}
