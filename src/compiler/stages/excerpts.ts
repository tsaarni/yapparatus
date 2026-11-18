/**
 * `<Excerpt from="/-/files/…" start="…" />` finds its lines in the file by their text at compile
 * time and becomes a code block that keeps the file's line numbers, which the highlighter colors.
 */
import type { Element, Root } from "hast";
import type { MdxJsxFlowElementHast } from "mdast-util-mdx-jsx";
import { visit } from "unist-util-visit";
import type { DiagnosticCode } from "../../document/diagnostic.ts";
import {
  type FileAddress,
  fileAddress,
  type LineRange,
  parseFileAddress,
} from "../../document/file-address.ts";
import type { ExternalFiles } from "../external-files.ts";
import { contentIssues } from "./conventions.ts";
import { languageOf } from "./highlight.ts";

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
 * A closing line that opens again, such as `) {` or `} else {`, continues the block, and so
 * does an opening `{` on the line after the start. Lines that start with `#`, such as C
 * preprocessor lines, are written in column 0 inside a block, so they do not end it.
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
    if (indent(line) > level || (last === first && line.trim() === "{")) {
      last = i + 1;
      continue;
    }
    if (line.trimStart().startsWith("#")) continue;
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
export function excerpts(files: ExternalFiles) {
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
      const wrap = node.attributes.find((a) => a.type === "mdxJsxAttribute" && a.name === "wrap");
      if (
        start === null ||
        end === null ||
        mark === null ||
        (end !== undefined && !start) ||
        (wrap && wrap.value !== null)
      ) {
        issue(
          "EXCERPT_INVALID",
          from as string,
          '<Excerpt> takes start="text", end="text", and mark="text" or mark={["text", "text"]}, written as strings, and a bare wrap; end needs start.',
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
