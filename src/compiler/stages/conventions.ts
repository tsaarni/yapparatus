/**
 * Markdown conventions turned into components (alerts, file trees, panels, figures) and checks of
 * code block languages and heading depth. Problems are recorded per file for the dev server.
 */
import { valueToEstree } from "estree-util-value-to-estree";
import type { Element, ElementContent, Root } from "hast";
import { toString as textOf } from "hast-util-to-string";
import type {
  MdxJsxAttribute,
  MdxJsxFlowElementHast,
  MdxJsxTextElementHast,
} from "mdast-util-mdx-jsx";
import { bundledLanguages } from "shiki";
import { visit } from "unist-util-visit";
import type { DiagnosticCode } from "../../document/diagnostic.ts";
import { alertKinds, type CodeMark, type FileTreeEntry } from "../../document/page-module.ts";

/** A problem the compiler found in a page, reported with its compile diagnostics. */
export interface ContentIssue {
  code: DiagnosticCode;
  /**
   * The line in the file. A figure's issue may leave it out: the server then reads the
   * figure's lines from the page as it is now.
   */
  line?: number;
  /** The figure it is about, by id. */
  target?: string;
  /** The diagram elements it is about. */
  elements?: string[];
  /**
   * What the issue is about, so the same problem keeps one identity as its wording changes.
   * Without it, the message identifies the issue.
   */
  subject?: string;
  message: string;
}

/**
 * Issues found in each compiled file, by absolute path.
 * The math stage starts them on every compile.
 */
export const contentIssues = new Map<string, ContentIssue[]>();

/** Plain text needs no grammar; every other name must be one Shiki knows. */
const plainLanguages = ["text", "txt", "plain"];

/** The stage that applies the Markdown conventions and records their problems. */
export function markdownConventions() {
  return (tree: Root, file: { path: string }) => {
    const issues = contentIssues.get(file.path) ?? [];
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

/** Check that a code block names a language Shiki knows, or plain text. */
function codeLanguage(pre: Element, line: number, issues: ContentIssue[]) {
  const code = pre.children.find((c): c is Element => c.type === "element" && c.tagName === "code");
  if (!code) return;
  const language = codeLanguageOf(code);
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
 * removed and the kind is left on the blockquote for the web app to render.
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
  if (!text.value) first.children.shift();
  if (first.children[0]?.type === "element" && first.children[0].tagName === "br")
    first.children.shift();
  if (!first.children.length) quote.children.splice(quote.children.indexOf(first), 1);
}

/** A `<code>` element's language, from its `language-*` class. */
export function codeLanguageOf(code: Element): string | undefined {
  const classes = Array.isArray(code.properties.className) ? code.properties.className : [];
  return classes
    .map(String)
    .find((c) => c.startsWith("language-"))
    ?.slice("language-".length);
}

/** An attribute's value, when it is written as a string. */
export function literal(jsx: MdxJsxFlowElementHast | MdxJsxTextElementHast, name: string) {
  const attr = jsx.attributes.find((a) => a.type === "mdxJsxAttribute" && a.name === name);
  return attr?.type === "mdxJsxAttribute" && typeof attr.value === "string"
    ? attr.value
    : undefined;
}

/** An attribute whose value is computed at compile time, which authors never write. */
export function compiledAttribute(name: string, value: unknown): MdxJsxAttribute {
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
 * the labels to the container, so the web app never inspects its children.
 */
function panels(
  jsx: MdxJsxFlowElementHast,
  line: number,
  issues: ContentIssue[],
  claimed: Set<unknown>,
) {
  const name = jsx.name ?? "";
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
 * A figure frames and numbers its content, so a figure inside it belongs to it and has no number,
 * caption, or id of its own.
 */
function figure(jsx: MdxJsxFlowElementHast, issues: ContentIssue[]) {
  visit(jsx, (inner) => {
    if (inner === jsx || inner.type !== "mdxJsxFlowElement") return;
    const nested = inner as MdxJsxFlowElementHast;
    if (!figureKinds.includes(nested.name ?? "")) return;
    const named = ["id", "caption"].filter((a) => literal(nested, a) !== undefined);
    if (named.length)
      issues.push({
        code: "FIGURE_NESTED",
        line: nested.position?.start.line ?? 0,
        subject: literal(nested, "id") || literal(nested, "caption") || `${nested.name}`,
        message: `A <${nested.name}> inside a <Figure> belongs to it and has no ${named.join(" or ")} of its own. Number the outer figure.`,
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

/** The file tree entries of a Markdown list's items. */
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

const markOf: Record<string, CodeMark> = { highlight: "highlight", "++": "add", "--": "remove" };

/**
 * A `[!code highlight|++|--]` comment at a line's end marks it, `:3` three lines; alone on its line
 * it marks the lines after it. It is removed before highlighting, so it works in any language.
 */
const notation =
  /[ \t]*(?:\/\/|#|--|;|%|\/\*|<!--)[ \t]*\[!code (highlight|\+\+|--)(?::(\d+))?\][ \t]*(?:\*\/|-->)?[ \t]*$/;

/** Code written on a page, with its mark comments removed. */
export interface MarkedCode {
  /** The lines shown. */
  lines: string[];
  /** For each line shown, its line in the code as written; a comment alone on its line is gone. */
  written: number[];
  /** Marked lines, by their index in `lines`. */
  marks: Record<number, CodeMark>;
}

/** Code written on a page with its mark comments removed and their marks collected. */
export function codeMarks(code: string): MarkedCode {
  const lines: string[] = [];
  const written: number[] = [];
  const marks: Record<number, CodeMark> = {};
  let active: { mark: CodeMark; left: number } | undefined;
  for (const [index, raw] of code.split("\n").entries()) {
    const match = raw.includes("[!code ") ? notation.exec(raw) : null;
    if (match?.[1]) {
      active = { mark: markOf[match[1]] as CodeMark, left: Number(match[2] ?? 1) };
      const before = raw.slice(0, match.index);
      if (!before.trim()) continue;
      lines.push(before);
    } else lines.push(raw);
    written.push(index + 1);
    if (active && active.left > 0) {
      marks[lines.length - 1] = active.mark;
      active.left -= 1;
    }
  }
  return { lines, written, marks };
}
