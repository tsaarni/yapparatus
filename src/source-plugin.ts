import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import path from "node:path";
import type { Element, Root, RootContent } from "hast";
import { visit } from "unist-util-visit";

export function revision(source: string): string {
  return createHash("sha256").update(source).digest("hex");
}

/**
 * Content hash of one block: its source lines. Unlike the file revision, it survives
 * edits elsewhere in the file, so old selections can still be found and verified.
 */
export function blockHash(lines: string[], start: number, end: number): string {
  return revision(lines.slice(start - 1, end).join("\n")).slice(0, 16);
}

/** Elements inside a block that get their own source range, so a selection points at the line. */
const innerBlocks = new Set(["li", "tr"]);

/**
 * Tag top-level blocks, list items, and table rows with their file, lines, and block hash.
 * The reader sends these back with a question; the server finds the lines again by hash.
 */
export function sourceContext(getRoot: () => string) {
  return () => (tree: Root, file: { path: string; value: unknown }) => {
    const text = String(file.value);
    const lines = text.split("\n");
    const source = path.relative(realpathSync(getRoot()), realpathSync(file.path));
    const range = (start: number, end: number) => ({
      "data-source": source,
      "data-hash": blockHash(lines, start, end),
      "data-start-line": start,
      "data-end-line": end,
    });
    visit(tree, "element", (node: Element) => {
      if (innerBlocks.has(node.tagName) && node.position)
        Object.assign(node.properties, range(node.position.start.line, node.position.end.line));
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
