/**
 * Code highlighting for pages, excerpts, and the file view, so code looks the same wherever it
 * appears. `<Excerpt from="/-/files/…" start="…" />` finds its lines in the file by their text
 * at compile time and becomes a highlighted code block that keeps the file's line numbers.
 */
import type { RehypeShikiOptions } from "@shikijs/rehype";
import rehypeShiki from "@shikijs/rehype";
import type { Element, Root } from "hast";
import type { MdxJsxFlowElementHast } from "mdast-util-mdx-jsx";
import {
  bundledLanguages,
  codeToHast,
  createCssVariablesTheme,
  type ShikiTransformer,
} from "shiki";
import { visit } from "unist-util-visit";
import {
  type FileAddress,
  fileAddress,
  type LineRange,
  parseFileAddress,
  parseLines,
} from "./files.ts";
import { codeMarks, contentIssues } from "./markdown-plugin.ts";
import type { DiagnosticCode, SourceFileView } from "./protocol.ts";
import type { SourceFile, SourceFiles } from "./source-files.ts";

/** Code colors come from CSS variables, so they follow the reader theme. */
const codeTheme = createCssVariablesTheme({ name: "yapparatus", variablePrefix: "--shiki-" });

const languageLabel: ShikiTransformer = {
  pre(node) {
    node.properties["data-language"] = this.options.lang;
  },
};

/** An excerpt's first line number and marked lines travel to Shiki in the code's meta. */
interface ExcerptMeta {
  start: number;
  marks: LineRange[];
}

function excerptMeta(raw: unknown): ExcerptMeta | undefined {
  if (typeof raw !== "string" || !raw.startsWith("excerpt")) return;
  const start = Number(/\bstart=(\d+)/.exec(raw)?.[1] ?? 1);
  const marks = (/\bmark=(\S+)/.exec(raw)?.[1] ?? "")
    .split(",")
    .flatMap((range) => parseLines(range) ?? []);
  return { start, marks };
}

/** Each line of a file's code carries its line number in the file, and marked lines their mark. */
const fileLines: ShikiTransformer = {
  name: "yapparatus:file-lines",
  line(node, line) {
    const meta = excerptMeta(this.options.meta?.__raw);
    if (!meta) return;
    const number = meta.start + line - 1;
    node.properties["data-line"] = number;
    if (meta.marks.some((m) => number >= m.start && number <= m.end))
      node.properties["data-mark"] = "highlight";
  },
};

export const codeHighlighting: [typeof rehypeShiki, RehypeShikiOptions] = [
  rehypeShiki,
  {
    theme: codeTheme,
    defaultLanguage: "text",
    fallbackLanguage: "text",
    // Common languages load at startup; any other Shiki language loads when a page uses it.
    // biome-ignore format: a list of names reads best on few lines.
    langs: ["ts", "tsx", "js", "jsx", "json", "sh", "bash", "http", "html", "css", "mdx", "md", "py", "go", "rust", "yaml", "sql"],
    lazy: true,
    transformers: [languageLabel, codeMarks, fileLines],
  },
];

/** Files known by name rather than by extension. */
const languageByName: Record<string, string> = {
  Dockerfile: "docker",
  Makefile: "make",
  "CMakeLists.txt": "cmake",
};

/** The Shiki language for a file, from its name or extension, or "text". */
export function languageOf(file: string): string {
  const name = file.split("/").at(-1) ?? file;
  const byName = languageByName[name];
  if (byName) return byName;
  const extension = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "";
  return extension && extension in bundledLanguages ? extension : "text";
}

/** A whole file as the file view shows it: highlighted like an excerpt that starts at line 1. */
export async function fileView(address: FileAddress, file: SourceFile): Promise<SourceFileView> {
  const language = languageOf(address.path);
  const code: Root = await codeToHast(file.lines.join("\n"), {
    lang: language,
    theme: codeTheme,
    meta: { __raw: "excerpt start=1" },
    transformers: [languageLabel, fileLines],
  });
  return {
    address: fileAddress({ folder: address.folder, path: address.path }),
    source: file.source,
    language,
    lines: file.lines.length,
    code,
  };
}

/** Files each compiled page or reply reads excerpts from, by the page's absolute path. */
export const excerptFiles = new Map<string, Set<string>>();

function literal(node: MdxJsxFlowElementHast, name: string) {
  const attr = node.attributes.find((a) => a.type === "mdxJsxAttribute" && a.name === name);
  if (!attr) return undefined;
  return attr.type === "mdxJsxAttribute" && typeof attr.value === "string" ? attr.value : null;
}

/** A text or a list of texts: `mark="retry"` or `mark={["retry", "backoff"]}`. Null if neither. */
function texts(node: MdxJsxFlowElementHast, name: string): string[] | null | undefined {
  const attr = node.attributes.find((a) => a.type === "mdxJsxAttribute" && a.name === name);
  if (attr?.type !== "mdxJsxAttribute") return undefined;
  if (typeof attr.value === "string") return [attr.value];
  const statement = (attr.value?.data?.estree?.body ?? [])[0];
  const list = statement?.type === "ExpressionStatement" ? statement.expression : undefined;
  if (list?.type !== "ArrayExpression") return null;
  const values = list.elements.map((e) =>
    e?.type === "Literal" && typeof e.value === "string" ? e.value : undefined,
  );
  return values.length && values.every((v) => v) ? (values as string[]) : null;
}

const indent = (line: string) => line.length - line.trimStart().length;
const closes = /^[}\])]/;
const opens = /[{([:]\s*$/;

/**
 * The lines an excerpt shows. `start` is the one line that contains its text. `end` is the
 * first line from there that contains its text; without it, the excerpt is the block the start
 * line opens: the lines indented deeper than it, and the closing line at its own indentation.
 * A closing line that opens again, such as `) {` or `} else {`, continues the block.
 */
export function excerptRange(
  lines: string[],
  start: string,
  end: string | undefined,
): LineRange | { error: string } {
  const found = lines.flatMap((line, i) => (line.includes(start) ? [i + 1] : []));
  if (found.length === 0) return { error: `start="${start}" is in no line of the file.` };
  if (found.length > 1)
    return {
      error: `start="${start}" is in ${found.length} lines, ${found.map((n) => `L${n}`).join(", ")}. Quote more of the line you mean.`,
    };
  const first = found[0] as number;
  if (end !== undefined) {
    const at = lines.findIndex((line, i) => i + 1 >= first && line.includes(end));
    if (at < 0) return { error: `end="${end}" is in no line from L${first} on.` };
    return { start: first, end: at + 1 };
  }
  const level = indent(lines[first - 1] ?? "");
  let last = first;
  for (let i = first; i < lines.length; i++) {
    const line = lines[i] as string;
    if (!line.trim()) continue;
    if (indent(line) > level) {
      last = i + 1;
      continue;
    }
    if (closes.test(line.trim())) {
      last = i + 1;
      if (opens.test(line)) continue;
    }
    break;
  }
  return { start: first, end: last };
}

/**
 * Fill each `<Excerpt>` with the lines it names, as a code block in the file's language, and
 * write the lines it found into `from`, so the bar links to them. A file that cannot be read
 * leaves the excerpt empty; the link check reports it. Problems in the tag itself, including
 * text the file no longer contains, are content issues with the page's line. Runs after the
 * Markdown conventions.
 */
export function excerpts(files: SourceFiles) {
  return () => (tree: Root, file: { path: string }) => {
    const read = new Set<string>();
    const issues = contentIssues.get(file.path) ?? [];
    contentIssues.set(file.path, issues);
    visit(tree, "mdxJsxFlowElement", (node: MdxJsxFlowElementHast) => {
      if (node.name !== "Excerpt") return;
      const line = node.position?.start.line ?? 0;
      const issue = (code: DiagnosticCode, subject: string, message: string) =>
        issues.push({ code, line, ...(subject ? { subject } : {}), message });
      const from = literal(node, "from");
      const address = typeof from === "string" ? parseFileAddress(from) : undefined;
      if (!address) {
        issue(
          "EXCERPT_INVALID",
          from ?? "",
          typeof from === "string"
            ? `<Excerpt from="${from}"> is not a file address. Write from="/-/files/<directory>/<path>".`
            : '<Excerpt> needs from="/-/files/<directory>/<path>", written as a string.',
        );
        return;
      }
      if (address.lines) {
        issue(
          "EXCERPT_INVALID",
          from as string,
          `<Excerpt from="${from}"> names lines by number, which move when the file changes. Name the file alone and add start="text of the first line".`,
        );
        return;
      }
      const start = literal(node, "start");
      const end = literal(node, "end");
      const mark = texts(node, "mark");
      if (start === null || end === null || mark === null || (end !== undefined && !start)) {
        issue(
          "EXCERPT_INVALID",
          from as string,
          '<Excerpt> takes start="text", end="text", and mark="text" or mark={["text", "text"]}, written as strings; end needs start.',
        );
        return;
      }
      const source = files.read(address);
      node.children = [];
      if ("error" in source) return;
      read.add(source.file);
      const shown = start
        ? excerptRange(source.lines, start, end)
        : { start: 1, end: source.lines.length };
      if ("error" in shown) {
        issue("EXCERPT_TEXT", start ?? "", `<Excerpt> in ${address.path}: ${shown.error}`);
        return;
      }
      const marked: number[] = [];
      for (const text of mark ?? []) {
        const at = source.lines.flatMap((l, i) =>
          i + 1 >= shown.start && i + 1 <= shown.end && l.includes(text) ? [i + 1] : [],
        );
        if (!at.length) {
          issue(
            "EXCERPT_TEXT",
            text,
            `<Excerpt mark="${text}"> is in no line of the excerpt, L${shown.start} to L${shown.end}.`,
          );
          return;
        }
        marked.push(...at);
      }
      fillExcerpt(node, address, source.lines, shown, [...new Set(marked)]);
    });
    excerptFiles.set(file.path, read);
  };
}

/**
 * Make `node` the excerpt of `lines` it shows: its `from` names the file and the lines, and
 * its child is the code block, which the highlighter colors and numbers with the file's lines.
 */
export function fillExcerpt(
  node: MdxJsxFlowElementHast,
  address: FileAddress,
  lines: string[],
  shown: LineRange,
  marked: number[] = [],
) {
  for (const attr of node.attributes)
    if (attr.type === "mdxJsxAttribute" && attr.name === "from")
      attr.value = fileAddress({ ...address, lines: shown });
  const marks = marked.map((n) => `L${n}`).join(",");
  const code: Element = {
    type: "element",
    tagName: "code",
    properties: { className: [`language-${languageOf(address.path)}`] },
    data: {
      meta: `excerpt start=${shown.start}${marks ? ` mark=${marks}` : ""}`,
    } as Element["data"],
    children: [{ type: "text", value: lines.slice(shown.start - 1, shown.end).join("\n") }],
  };
  node.children = [{ type: "element", tagName: "pre", properties: {}, children: [code] }];
}
