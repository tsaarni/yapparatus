/** The stage that gives headings their ids, after the ids that blocks such as figures take. */
import GithubSlugger from "github-slugger";
import type { Element, Root } from "hast";
import { toString as textOf } from "hast-util-to-string";
import type { MdxJsxFlowElementHast } from "mdast-util-mdx-jsx";
import { visit } from "unist-util-visit";
import { literal } from "./conventions.ts";
import { numberedComponents } from "./outline.ts";

/**
 * Give each heading an id from its text. The page's explicit block ids are taken first, so a
 * heading that would share one gets a suffix, as a repeated heading does: `components-1`.
 */
export function headingIds() {
  return (tree: Root) => {
    const slugger = new GithubSlugger();
    visit(tree, ["mdxJsxFlowElement", "mdxJsxTextElement"], (node) => {
      const jsx = node as MdxJsxFlowElementHast;
      const id = jsx.name && numberedComponents[jsx.name] ? literal(jsx, "id") : undefined;
      if (id) slugger.slug(id);
    });
    visit(tree, "element", (node: Element) => {
      if (/^h[1-6]$/.test(node.tagName) && node.properties.id === undefined)
        node.properties.id = slugger.slug(textOf(node));
    });
  };
}
