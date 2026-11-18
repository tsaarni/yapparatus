/**
 * What a compiled page carries to the web app: its outline, and the values the compiler
 * writes into its components' props.
 */

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

/** One of `numberedKinds`. */
export type NumberedKind = (typeof numberedKinds)[number];

/** What a page contains, extracted at compile time and exported as `outline`. */
export interface PageOutline {
  /** SHA-256 of the page source and the files the page reads, from `pageRevision`. */
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

/** How a line of code is marked: highlighted, added, or removed. */
export type CodeMark = "highlight" | "add" | "remove";

/**
 * Highlighted code, as code blocks, excerpts, and the file view carry it. Each token style is
 * written once in `styles`, and each line is a list of its tokens.
 */
export interface HighlightedCode {
  /** The Shiki language, or "text". */
  language: string;
  /** Each token style once, as CSS: "color:var(--shiki-token-keyword)". */
  styles: string[];
  /** Each line's tokens, as pairs: the index of the token's style, then its text. */
  lines: Array<Array<number | string>>;
  /** Code from a file: the first line's number in the file. Its lines show their numbers. */
  start?: number;
  /** Code written on a page: each line's line in the page. */
  pageLines?: number[];
  /** Marked lines, by their index in `lines`. */
  marks?: Record<number, CodeMark>;
}

/** One entry of a `<FileTree>`, parsed from its Markdown list at compile time. */
export interface FileTreeEntry {
  name: string;
  kind: "directory" | "file" | "more";
  /** Words after the name, shown beside it. */
  comment?: string;
  /** Written in bold: the entry the text is about. */
  highlight?: boolean;
  children?: FileTreeEntry[];
}

/** The kinds of GitHub alert, as `> [!NOTE]` writes them. */
export const alertKinds = ["note", "tip", "important", "warning", "caution"] as const;

/** One of `alertKinds`. */
export type AlertKind = (typeof alertKinds)[number];
