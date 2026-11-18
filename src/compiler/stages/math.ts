/**
 * Math: TeX between `$$` marks, which remark-math reads, becomes MathML when the page compiles,
 * so the browser draws it natively and runs no math code. TeX that does not parse is reported
 * as `MATH_INVALID` and shown as its source. This is the first stage, so the conventions stage
 * does not read math as code blocks; it starts the page's issues.
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

export function math() {
  return (tree: Root, file: { path: string }) => {
    const issues: ContentIssue[] = [];
    visit(tree, "element", (el, index, parent) => {
      if (!parent || index === undefined) return;
      // remark-math writes block math as <pre><code class="math-display"> and inline math as
      // <code class="math-inline">.
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
      // The MathML's positions are in Temml's output; the math takes the place of the TeX.
      removePosition(node);
      node.position = el.position;
      parent.children[index] = node;
      return SKIP;
    });
    contentIssues.set(file.path, issues);
  };
}

function render(tex: string, display: boolean, line: number, issues: ContentIssue[]) {
  try {
    const html = temml.renderToString(tex, { displayMode: display, throwOnError: true });
    const [node] = fromHtml(html, { fragment: true }).children;
    return node as ElementContent;
  } catch (error) {
    // Temml's message names the problem first, then underlines it in the source.
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
