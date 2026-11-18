/**
 * Code highlighting for pages, excerpts, and the file view, so code looks the same wherever it
 * appears. Each becomes `HighlightedCode`, which the web app draws.
 */
import type { Element, Root } from "hast";
import { toString as textOf } from "hast-util-to-string";
import {
  type BundledLanguage,
  bundledLanguages,
  codeToTokens,
  createCssVariablesTheme,
  getTokenStyleObject,
  isSpecialLang,
  stringifyTokenStyle,
} from "shiki";
import { visit } from "unist-util-visit";
import { type FileAddress, fileAddress, parseLines } from "../../document/file-address.ts";
import type { CodeMark, HighlightedCode } from "../../document/page-module.ts";
import type { SourceFileView } from "../../protocol/rest-api.ts";
import type { SourceFile } from "../external-files.ts";
import { codeLanguageOf, codeMarks } from "./conventions.ts";

/** Code colors come from CSS variables, so they follow the theme. */
const codeTheme = createCssVariablesTheme({ name: "yapparatus", variablePrefix: "--shiki-" });

/** Shiki's font style bits for underline and strikethrough. */
const underOrThrough = 4 | 8;

/**
 * Highlight `code` in `language`. A language Shiki does not know reads as text. Shiki loads a
 * language the first time code uses it.
 */
export async function highlight(
  code: string,
  language: string,
  lines: Pick<HighlightedCode, "start" | "pageLines" | "marks"> = {},
): Promise<HighlightedCode> {
  const lang =
    Object.hasOwn(bundledLanguages, language) || isSpecialLang(language) ? language : "text";
  const { tokens } = await codeToTokens(code, { lang: lang as BundledLanguage, theme: codeTheme });
  const styles: string[] = [];
  const index = new Map<string, number>();
  const styleOf = (style: string) => {
    let at = index.get(style);
    if (at === undefined) {
      at = styles.push(style) - 1;
      index.set(style, at);
    }
    return at;
  };
  return {
    language: lang,
    styles,
    lines: tokens.map((line) => {
      const runs: Array<number | string> = [];
      let space = "";
      line.forEach((token, i) => {
        const joins = !((token.fontStyle ?? 0) & underOrThrough);
        if (joins && /^\s+$/.test(token.content) && line[i + 1]) {
          space += token.content;
          return;
        }
        if (space && !joins) runs.push(styleOf(""), space);
        const style = stringifyTokenStyle(token.htmlStyle || getTokenStyleObject(token));
        runs.push(styleOf(style), (joins ? space : "") + token.content);
        space = "";
      });
      return runs;
    }),
    ...lines,
  };
}

/**
 * A block's code, highlighted. Its meta says where it comes from: `page start=N` for code on a
 * page, or `excerpt start=N mark=L3,L5-L7` for lines of a file, N being its first line there.
 */
function codeOf(element: Element): Promise<HighlightedCode> {
  const language = codeLanguageOf(element) ?? "text";
  const meta = String((element.data as { meta?: unknown } | undefined)?.meta ?? "");
  const text = textOf(element).replace(/\n$/, "");
  if (meta.startsWith("excerpt")) {
    const start = Number(/\bstart=(\d+)/.exec(meta)?.[1] ?? 1);
    const ranges = (/\bmark=(\S+)/.exec(meta)?.[1] ?? "")
      .split(",")
      .flatMap((range) => parseLines(range) ?? []);
    const marks: Record<number, CodeMark> = {};
    text.split("\n").forEach((_line, i) => {
      if (ranges.some((r) => start + i >= r.start && start + i <= r.end)) marks[i] = "highlight";
    });
    return highlight(text, language, { start, ...marked(marks) });
  }
  const { lines, written, marks } = codeMarks(text);
  const page = /^page start=(\d+)/.exec(meta);
  return highlight(lines.join("\n"), language, {
    ...(page ? { pageLines: written.map((line) => Number(page[1]) + line - 1) } : {}),
    ...marked(marks),
  });
}

const marked = (marks: Record<number, CodeMark>) => (Object.keys(marks).length ? { marks } : {});

/**
 * Highlight every code block. A block becomes a `pre` without children whose `data-code` is
 * its `HighlightedCode` as JSON: MDX keeps it as one string, which the browser parses fast.
 */
export function codeHighlighting() {
  return async (tree: Root) => {
    const blocks: Array<{ pre: Element; code: Element }> = [];
    visit(tree, "element", (pre: Element) => {
      const code = pre.tagName === "pre" ? pre.children[0] : undefined;
      if (code?.type === "element" && code.tagName === "code") blocks.push({ pre, code });
    });
    await Promise.all(
      blocks.map(async ({ pre, code }) => {
        pre.properties = { dataCode: JSON.stringify(await codeOf(code)) };
        pre.children = [];
      }),
    );
  };
}

/** Files known by name rather than by extension, in lowercase. */
const languageByName: Record<string, string> = {
  dockerfile: "docker",
  containerfile: "docker",
  makefile: "make",
  gnumakefile: "make",
  "cmakelists.txt": "cmake",
  build: "python",
  "build.bazel": "python",
  workspace: "python",
  "workspace.bazel": "python",
  jenkinsfile: "groovy",
  gemfile: "ruby",
  rakefile: "ruby",
  ".bashrc": "bash",
  ".bash_profile": "bash",
  ".profile": "bash",
  ".zshrc": "zsh",
};

/** Extensions that Shiki does not know by name. A `.h` header is read as C++, which covers C. */
const languageByExtension: Record<string, string> = {
  cc: "cpp",
  cxx: "cpp",
  hh: "cpp",
  hpp: "cpp",
  hxx: "cpp",
  h: "cpp",
  m: "objective-c",
  mm: "objective-cpp",
  pl: "perl",
  ex: "elixir",
  exs: "elixir",
  ml: "ocaml",
  sv: "system-verilog",
  bzl: "python",
  mk: "make",
  patch: "diff",
  gradle: "groovy",
  v: "verilog",
};

/**
 * The Shiki language for a file, from its name or extension, or "text". A Dockerfile keeps its
 * language with a suffix, as in `Dockerfile.dev`.
 */
export function languageOf(file: string): string {
  const name = (file.split("/").at(-1) ?? file).toLowerCase();
  const stem = name.slice(0, name.indexOf(".") > 0 ? name.indexOf(".") : undefined);
  const byName =
    own(languageByName, name) ??
    (stem === "dockerfile" || stem === "containerfile" ? "docker" : undefined);
  if (byName) return byName;
  const extension = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1) : "";
  const language = own(languageByExtension, extension) ?? extension;
  return language && Object.hasOwn(bundledLanguages, language) ? language : "text";
}

const own = (map: Record<string, string>, key: string) =>
  Object.hasOwn(map, key) ? map[key] : undefined;

/** A whole file as the file view shows it: highlighted, numbered from line 1. */
export async function fileView(address: FileAddress, file: SourceFile): Promise<SourceFileView> {
  return {
    address: fileAddress({ folder: address.folder, path: address.path }),
    source: file.source,
    code: await highlight(file.lines.join("\n"), languageOf(address.path), { start: 1 }),
  };
}
