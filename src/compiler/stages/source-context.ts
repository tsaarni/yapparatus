/** The stage that tags rendered blocks with their source file and lines, for reader selections. */
import { realpathSync } from "node:fs";
import path from "node:path";
import type { Element, Root, RootContent } from "hast";
import { visit } from "unist-util-visit";

/** Elements inside a block that get their own source range, so a selection points at the line. */
const innerBlocks = new Set(["li", "tr"]);

/** The meta string an author wrote after a code fence's language. */
function codeMeta(code: Element): string {
  return String((code.data as { meta?: unknown } | undefined)?.meta ?? "");
}

/**
 * Tag top-level blocks, list items, and table rows with their file and lines, and give each
 * line of a code block its line in the file. The reader sends these back with a message.
 */
export function sourceContext(getRoot: () => string) {
  return () => (tree: Root, file: { path: string }) => {
    const source = path.relative(realpathSync(getRoot()), realpathSync(file.path));
    const range = (start: number, end: number) => ({
      "data-source": source,
      "data-start-line": start,
      "data-end-line": end,
    });
    visit(tree, "element", (node: Element) => {
      if (innerBlocks.has(node.tagName) && node.position)
        Object.assign(node.properties, range(node.position.start.line, node.position.end.line));
      const code = node.tagName === "pre" ? node.children[0] : undefined;
      if (node.position && code?.type === "element" && code.tagName === "code")
        code.data = {
          ...code.data,
          meta: [`page start=${node.position.start.line + 1}`, codeMeta(code)]
            .filter(Boolean)
            .join(" "),
        } as Element["data"];
    });
    let previousHeading = false;
    tree.children = tree.children.map((node): RootContent => {
      if (!node.position || node.type === "doctype" || node.type === "mdxjsEsm") return node;
      if (node.type === "element") {
        if (node.tagName === "p" && previousHeading) node.properties["data-lead"] = "true";
        previousHeading = node.tagName === "h1";
      } else if (node.type !== "text") previousHeading = false;
      return {
        type: "element",
        tagName: "div",
        properties: range(node.position.start.line, node.position.end.line),
        children: [node],
      };
    });
  };
}
