/**
 * Markdown conventions the compiler turns into components, and the rules it checks: GitHub
 * alerts, file trees, panels, figures, code block languages, and heading depth. Problems are recorded per file,
 * and the dev server reports them with the page's other compile diagnostics.
 */
import { valueToEstree } from "estree-util-value-to-estree";
import type { Element, ElementContent, Root } from "hast";
import { toString as textOf } from "hast-util-to-string";
import type { MdxJsxAttribute, MdxJsxFlowElementHast } from "mdast-util-mdx-jsx";
import { bundledLanguages, type ShikiTransformer } from "shiki";
import { visit } from "unist-util-visit";
import type { DiagnosticCode } from "./protocol.ts";

export interface ContentIssue {
  code: DiagnosticCode;
  line: number;
  /**
   * What the issue is about, so the same problem keeps one identity as its wording changes.
   * Without it, the message identifies the issue.
   */
  subject?: string;
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
    // Panels a container has claimed; the tree is visited parents first.
    const claimed = new Set<unknown>();
    visit(tree, (node) => {
      const line = node.position?.start.line ?? 0;
      if (node.type === "mdxJsxFlowElement") {
        const jsx = node as MdxJsxFlowElementHast;
        if (jsx.name === "FileTree") fileTree(jsx, line, issues);
        if (jsx.name === "Tabs" || jsx.name === "Columns") panels(jsx, line, issues, claimed);
        if (jsx.name === "Figure") figure(jsx, issues);
        if (jsx.name === "Figure" || jsx.name === "Listing") widen(jsx);
        if (jsx.name === "Panel" && !claimed.has(jsx))
          issues.push({
            code: "PANEL_NESTED",
            line,
            subject: literal(jsx, "label") ?? "Panel",
            message: "<Panel> belongs directly inside <Tabs> or <Columns>.",
          });
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
  // A block without a language is told apart by its first line.
  const first = textOf(code).trim().split("\n")[0]?.slice(0, 60);
  if (!language)
    issues.push({
      code: "CODE_LANGUAGE",
      line,
      ...(first ? { subject: first } : {}),
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

/** An attribute's value, when it is written as a string. */
function literal(jsx: MdxJsxFlowElementHast, name: string) {
  const attr = jsx.attributes.find((a) => a.type === "mdxJsxAttribute" && a.name === name);
  return attr?.type === "mdxJsxAttribute" && typeof attr.value === "string"
    ? attr.value
    : undefined;
}

/** An attribute whose value is computed at compile time, which authors never write. */
function compiledAttribute(name: string, value: unknown): MdxJsxAttribute {
  return {
    type: "mdxJsxAttribute",
    name,
    value: {
      type: "mdxJsxAttributeValueExpression",
      value: JSON.stringify(value),
      data: {
        estree: {
          type: "Program",
          sourceType: "module",
          body: [{ type: "ExpressionStatement", expression: valueToEstree(value) }],
        },
      },
    },
  };
}

const maxColumns = 3;
const containers = ["Tabs", "Columns"];

/**
 * `<Tabs>` and `<Columns>` hold only `<Panel>`s, each with its own label. The compiler passes
 * the labels to the container, so the reader never inspects its children.
 */
function panels(
  jsx: MdxJsxFlowElementHast,
  line: number,
  issues: ContentIssue[],
  claimed: Set<unknown>,
) {
  const name = jsx.name ?? "";
  // Each issue's subject tells it apart from others in the same file: the stray text, the
  // panel's label or position, or the container's labels.
  const report = (code: DiagnosticCode, message: string, subject: string, at = line) =>
    issues.push({ code, line: at, subject, message });
  const content = jsx.children.filter((c) => !(c.type === "text" && !c.value.trim()));
  const labels: string[] = [];
  for (const [index, child] of content.entries()) {
    const at = child.position?.start.line ?? line;
    if (child.type !== "mdxJsxFlowElement" || child.name !== "Panel") {
      report(
        "PANEL_CONTENT",
        `<${name}> holds only <Panel> elements. Put the content inside a panel.`,
        textOf(child as ElementContent)
          .trim()
          .slice(0, 60) || `${name} child ${index + 1}`,
        at,
      );
      continue;
    }
    claimed.add(child);
    const label = literal(child, "label");
    if (!label?.trim())
      report(
        "PANEL_LABEL",
        `Each <Panel> in <${name}> needs a label, written as a string.`,
        `${name} panel ${index + 1}`,
        at,
      );
    else if (labels.includes(label))
      report(
        "PANEL_LABEL",
        `Two panels in <${name}> have the label "${label}". Labels must differ.`,
        label,
        at,
      );
    else labels.push(label);
    visit(child, (inner) => {
      if (
        inner !== child &&
        inner.type === "mdxJsxFlowElement" &&
        containers.includes(inner.name ?? "")
      )
        report(
          "PANEL_NESTED",
          `<${inner.name}> cannot be inside <${name}>. Keep panels one level deep.`,
          `${inner.name} in ${label ?? name}`,
          inner.position?.start.line ?? at,
        );
    });
  }
  const all = `${name}: ${labels.join(", ")}`;
  if (labels.length < 2) report("PANEL_CONTENT", `<${name}> needs at least two panels.`, all);
  if (name === "Columns" && labels.length > maxColumns)
    report(
      "TOO_MANY_COLUMNS",
      `<Columns> holds at most ${maxColumns} panels. Use a table to compare more.`,
      all,
    );
  jsx.attributes.push(compiledAttribute("labels", labels));
}

const figureKinds = ["Figure", "Diagram", "Chart"];

/**
 * A figure or listing that holds columns takes the whole width, so each column gets a fair
 * share: drawings side by side in a figure, code side by side in a listing.
 */
function widen(jsx: MdxJsxFlowElementHast) {
  if (jsx.children.some((c) => c.type === "mdxJsxFlowElement" && c.name === "Columns"))
    jsx.attributes.push({ type: "mdxJsxAttribute", name: "wide", value: null });
}

/**
 * A figure frames and numbers its content, so a figure inside it is a part: it has no number,
 * caption, or id of its own.
 */
function figure(jsx: MdxJsxFlowElementHast, issues: ContentIssue[]) {
  visit(jsx, (inner) => {
    if (inner === jsx || inner.type !== "mdxJsxFlowElement") return;
    const part = inner as MdxJsxFlowElementHast;
    if (!figureKinds.includes(part.name ?? "")) return;
    const named = ["id", "caption"].filter((a) => literal(part, a) !== undefined);
    if (named.length)
      issues.push({
        code: "FIGURE_NESTED",
        line: part.position?.start.line ?? 0,
        subject: literal(part, "id") || literal(part, "caption") || `${part.name}`,
        message: `A <${part.name}> inside a <Figure> is part of it and has no ${named.join(" or ")} of its own. Number the outer figure.`,
      });
  });
}

/**
 * `<FileTree>` wraps one Markdown list. The compiler reads the list into entries and passes
 * them to the component, which draws the tree.
 */
function fileTree(jsx: MdxJsxFlowElementHast, line: number, issues: ContentIssue[]) {
  const content = jsx.children.filter((c) => !(c.type === "text" && !c.value.trim()));
  const list = content[0];
  if (content.length !== 1 || list?.type !== "element" || list.tagName !== "ul") {
    const first = textOf(jsx as unknown as ElementContent)
      .trim()
      .split("\n")[0]
      ?.slice(0, 60);
    issues.push({
      code: "FILE_TREE_INVALID",
      line,
      ...(first ? { subject: first } : {}),
      message:
        "<FileTree> wraps one Markdown list, with a blank line after the opening tag and before the closing tag.",
    });
    return;
  }
  jsx.children = [];
  jsx.attributes.push(compiledAttribute("entries", listEntries(list)));
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
