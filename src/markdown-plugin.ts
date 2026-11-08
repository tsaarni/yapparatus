/**
 * Markdown conventions the compiler turns into components, and the rules it checks: GitHub
 * alerts, file trees, code block languages, and heading depth. Problems are recorded per file,
 * and the dev server reports them with the page's other compile diagnostics.
 */
import { valueToEstree } from "estree-util-value-to-estree";
import type { Element, ElementContent, Root } from "hast";
import { toString as textOf } from "hast-util-to-string";
import type { MdxJsxFlowElementHast } from "mdast-util-mdx-jsx";
import { bundledLanguages, type ShikiTransformer } from "shiki";
import { visit } from "unist-util-visit";

export interface ContentIssue {
  code: "ALERT_TYPE" | "CHART" | "CODE_LANGUAGE" | "EXCERPT" | "FILE_TREE" | "HEADING_DEPTH";
  line: number;
  /** What the issue is about, so the same problem keeps one identity as its wording changes. */
  subject: string;
  message: string;
}

/** Issues found in each compiled file, by absolute path. Replaced on every compile. */
export const contentIssues = new Map<string, ContentIssue[]>();

export const alertKinds = ["note", "tip", "important", "warning", "caution"] as const;
export type AlertKind = (typeof alertKinds)[number];

/** Plain text needs no grammar; every other name must be one Shiki knows. */
const plainLanguages = ["text", "txt", "plain"];

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

export function markdownConventions() {
  return (tree: Root, file: { path: string }) => {
    const issues: ContentIssue[] = [];
    visit(tree, (node) => {
      const line = node.position?.start.line ?? 0;
      if (node.type === "mdxJsxFlowElement") {
        const jsx = node as MdxJsxFlowElementHast;
        if (jsx.name === "FileTree") fileTree(jsx, line, issues);
        return;
      }
      if (node.type !== "element") return;
      const el = node as Element;
      if (/^h[4-6]$/.test(el.tagName))
        issues.push({
          code: "HEADING_DEPTH",
          line,
          subject: textOf(el).trim(),
          message: `A ${"#".repeat(Number(el.tagName[1]))} heading is too deep. Use ## and ### only: deeper headings are not numbered or listed in the contents.`,
        });
      if (el.tagName === "pre") codeLanguage(el, line, issues);
      if (el.tagName === "blockquote") alert(el, line, issues);
    });
    contentIssues.set(file.path, issues);
  };
}

function codeLanguage(pre: Element, line: number, issues: ContentIssue[]) {
  const code = pre.children.find((c): c is Element => c.type === "element" && c.tagName === "code");
  if (!code) return;
  const classes = Array.isArray(code.properties.className) ? code.properties.className : [];
  const language = classes
    .map(String)
    .find((c) => c.startsWith("language-"))
    ?.slice("language-".length);
  if (!language)
    issues.push({
      code: "CODE_LANGUAGE",
      line,
      subject: "",
      message:
        "A code block names no language. Name one, such as ```ts, or ```text for plain text.",
    });
  else if (!plainLanguages.includes(language) && !(language in bundledLanguages))
    issues.push({
      code: "CODE_LANGUAGE",
      line,
      subject: language,
      message: `The code block language "${language}" is unknown. Use a Shiki language name, or text.`,
    });
}

/**
 * `> [!NOTE]` as the first line of a blockquote makes it an alert of that kind. The marker is
 * removed and the kind is left on the blockquote for the reader to render.
 */
function alert(quote: Element, line: number, issues: ContentIssue[]) {
  const first = quote.children.find((c): c is Element => c.type === "element");
  if (first?.tagName !== "p") return;
  const text = first.children[0];
  if (text?.type !== "text") return;
  const marker = /^\[!(\w+)\][ \t]*\n?/.exec(text.value);
  if (!marker?.[1]) return;
  const kind = marker[1].toLowerCase();
  if (!(alertKinds as readonly string[]).includes(kind)) {
    issues.push({
      code: "ALERT_TYPE",
      line,
      subject: marker[1],
      message: `[!${marker[1]}] is not an alert. Use ${alertKinds.map((k) => `[!${k.toUpperCase()}]`).join(", ")}.`,
    });
    return;
  }
  quote.properties.dataAlert = kind;
  text.value = text.value.slice(marker[0].length);
  // The marker alone on its line leaves an empty paragraph, or a line break to drop.
  if (!text.value) first.children.shift();
  if (first.children[0]?.type === "element" && first.children[0].tagName === "br")
    first.children.shift();
  if (!first.children.length) quote.children.splice(quote.children.indexOf(first), 1);
}

/**
 * `<FileTree>` wraps one Markdown list. The compiler reads the list into entries and passes
 * them to the component, which draws the tree.
 */
function fileTree(jsx: MdxJsxFlowElementHast, line: number, issues: ContentIssue[]) {
  const content = jsx.children.filter((c) => !(c.type === "text" && !c.value.trim()));
  const list = content[0];
  if (content.length !== 1 || list?.type !== "element" || list.tagName !== "ul") {
    issues.push({
      code: "FILE_TREE",
      line,
      subject: "",
      message:
        "<FileTree> wraps one Markdown list, with a blank line after the opening tag and before the closing tag.",
    });
    return;
  }
  const entries = listEntries(list);
  jsx.children = [];
  jsx.attributes.push({
    type: "mdxJsxAttribute",
    name: "entries",
    value: {
      type: "mdxJsxAttributeValueExpression",
      value: JSON.stringify(entries),
      data: {
        estree: {
          type: "Program",
          sourceType: "module",
          body: [{ type: "ExpressionStatement", expression: valueToEstree(entries) }],
        },
      },
    },
  });
}

function listEntries(list: Element): FileTreeEntry[] {
  return list.children
    .filter((c): c is Element => c.type === "element" && c.tagName === "li")
    .map(listEntry);
}

/**
 * An item's first word is the name, and the rest is a comment. A name ending in `/`, or an
 * item with a nested list, is a directory. `…` or `...` stands for entries left out.
 */
function listEntry(item: Element): FileTreeEntry {
  const nested = item.children.find(
    (c): c is Element => c.type === "element" && c.tagName === "ul",
  );
  // A loose list wraps the item's text in a paragraph.
  const inline: ElementContent[] = item.children.flatMap((c) =>
    c === nested ? [] : c.type === "element" && c.tagName === "p" ? c.children : [c],
  );
  const lead = inline.find((c) => !(c.type === "text" && !c.value.trim()));
  const highlight = lead?.type === "element" && lead.tagName === "strong";
  const all = inline
    .map((c) => textOf(c))
    .join("")
    .trim();
  const [word = "", ...rest] = highlight ? [textOf(lead).trim()] : all.split(/\s+/);
  const comment = (highlight ? all.slice(word.length) : rest.join(" ")).trim();
  const directory = word.endsWith("/") || !!nested;
  return {
    name: directory ? word.replace(/\/$/, "") : word,
    kind: word === "…" || word === "..." ? "more" : directory ? "directory" : "file",
    ...(comment ? { comment } : {}),
    ...(highlight ? { highlight } : {}),
    ...(nested ? { children: listEntries(nested) } : {}),
  };
}

export type CodeMark = "highlight" | "add" | "remove";

const markOf: Record<string, CodeMark> = { highlight: "highlight", "++": "add", "--": "remove" };

/**
 * `[!code highlight]`, `[!code ++]`, and `[!code --]` in a comment at the end of a line mark it;
 * `:3` marks three lines from there. A comment alone on its line marks the lines after it. The
 * comment is removed before highlighting, so it works in any language, even one without
 * comments, such as JSON. Code read from a file is shown exactly as written: its marks come
 * from the excerpt's `mark` attribute.
 */
const notation =
  /[ \t]*(?:\/\/|#|--|;|%|\/\*|<!--)[ \t]*\[!code (highlight|\+\+|--)(?::(\d+))?\][ \t]*(?:\*\/|-->)?[ \t]*$/;

/** Shiki shares `meta` between a block's hooks; options are copied between them. */
type MarksMeta = { codeMarks?: Map<number, CodeMark> };

export const codeMarks: ShikiTransformer = {
  name: "yapparatus:code-marks",
  preprocess(code) {
    if (!code.includes("[!code ") || String(this.options.meta?.__raw ?? "").startsWith("excerpt"))
      return;
    const lines: string[] = [];
    const marked = new Map<number, CodeMark>();
    let active: { mark: CodeMark; left: number } | undefined;
    for (const raw of code.split("\n")) {
      const match = notation.exec(raw);
      if (match?.[1]) {
        active = { mark: markOf[match[1]] as CodeMark, left: Number(match[2] ?? 1) };
        const before = raw.slice(0, match.index);
        if (!before.trim()) continue;
        lines.push(before);
      } else lines.push(raw);
      if (active && active.left > 0) {
        marked.set(lines.length, active.mark);
        active.left -= 1;
      }
    }
    (this.meta as MarksMeta).codeMarks = marked;
    return lines.join("\n");
  },
  line(node, line) {
    const mark = (this.meta as MarksMeta).codeMarks?.get(line);
    if (mark) node.properties["data-mark"] = mark;
  },
};
