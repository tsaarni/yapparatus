/**
 * The stage that turns TeX between `$$` marks into MathML, so the browser runs no math code.
 * It runs first and starts the page's issues; TeX that does not parse is shown as its source.
 */
import type { Element, ElementContent, Root } from "hast";
import { fromHtml } from "hast-util-from-html";
import { toString as textOf } from "hast-util-to-string";
import temml from "temml";
import { removePosition } from "unist-util-remove-position";
import { SKIP, visit } from "unist-util-visit";
import { type ContentIssue, contentIssues } from "./conventions.ts";

const hasClass = (el: Element, name: string) =>
  Array.isArray(el.properties.className) && el.properties.className.includes(name);

/** Replace each math element with its MathML and report TeX that does not parse. */
export function math() {
  return (tree: Root, file: { path: string }) => {
    const issues: ContentIssue[] = [];
    visit(tree, "element", (el, index, parent) => {
      if (!parent || index === undefined) return;
      const code =
        el.tagName === "pre"
          ? el.children.find((c): c is Element => c.type === "element" && c.tagName === "code")
          : el;
      if (code?.tagName !== "code") return;
      const display = hasClass(code, "math-display");
      if (!display && !hasClass(code, "math-inline")) return;
      const tex = textOf(code).trim();
      const line = el.position?.start.line ?? 0;
      const node = render(tex, display, line, issues);
      removePosition(node);
      node.position = el.position;
      parent.children[index] = node;
      return SKIP;
    });
    contentIssues.set(file.path, issues);
  };
}

/** One TeX expression as MathML, or as its source in a code element if it does not parse. */
function render(tex: string, display: boolean, line: number, issues: ContentIssue[]) {
  try {
    const html = temml.renderToString(tex, { displayMode: display, throwOnError: true });
    const [node] = fromHtml(html, { fragment: true }).children;
    return node as ElementContent;
  } catch (error) {
    const reason = (error instanceof Error ? error.message : String(error))
      .trim()
      .split("\n")[0]
      ?.replace(/:$/, "");
    issues.push({ code: "MATH_INVALID", line, subject: tex, message: `Invalid math: ${reason}.` });
    const source: Element = {
      type: "element",
      tagName: "code",
      properties: { className: ["language-text"] },
      children: [{ type: "text", value: tex }],
    };
    return display
      ? ({ type: "element", tagName: "pre", properties: {}, children: [source] } as Element)
      : source;
  }
}
