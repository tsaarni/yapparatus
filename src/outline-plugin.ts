import { valueToEstree } from "estree-util-value-to-estree";
import type { Element, Root } from "hast";
import { toString as textOf } from "hast-util-to-string";
import type { MdxJsxFlowElementHast, MdxJsxTextElementHast } from "mdast-util-mdx-jsx";
import { visit } from "unist-util-visit";
import type { NumberedKind, PageOutline } from "./document.ts";
import { revision } from "./source-plugin.ts";

/** Which MDX components are numbered blocks, and of which kind. */
const numberedComponents: Record<string, NumberedKind> = {
  Chart: "figure",
  Diagram: "figure",
  Figure: "figure",
  Table: "table",
  Listing: "listing",
};

function literal(node: MdxJsxFlowElementHast | MdxJsxTextElementHast, name: string) {
  const attr = node.attributes.find((a) => a.type === "mdxJsxAttribute" && a.name === name);
  return attr?.type === "mdxJsxAttribute" && typeof attr.value === "string"
    ? attr.value
    : undefined;
}

/**
 * Outlines and the capitalized components each compiled file uses, by absolute path. The
 * dev server reads them to check an agent's reply with the same pipeline that compiles pages.
 */
export const compiled = new Map<string, { outline: PageOutline; components: string[] }>();

/**
 * Record the page's sections and figures and export them as `outline`, so the reader can
 * number them and resolve cross-references across pages. Runs after heading ids exist.
 * `isPage` tells document pages, which must have one `#` title, from chat replies, which have none.
 */
export function pageOutline(isPage: (file: string) => boolean) {
  return (tree: Root, file: { path: string; value: unknown }) => {
    const outline: PageOutline = {
      revision: revision(String(file.value)),
      title: "",
      headings: [],
      numbered: [],
      anchors: [],
      links: [],
      refs: [],
    };
    const titles: string[] = [];
    const components = new Set<string>();
    /** The heading the walk is under, so each link knows its section. */
    let section: string | undefined;
    const link = (href: string, line: number) =>
      outline.links.push({ href, line, ...(section ? { section } : {}) });
    visit(tree, (node) => {
      const line = node.position?.start.line ?? 0;
      if (node.type === "element") {
        const el = node as Element;
        if (el.tagName === "h1") titles.push(textOf(el).trim());
        if ((el.tagName === "h2" || el.tagName === "h3") && typeof el.properties.id === "string") {
          section = el.properties.id;
          outline.headings.push({
            depth: el.tagName === "h2" ? 2 : 3,
            id: el.properties.id,
            text: textOf(el).trim(),
          });
        }
        if (typeof el.properties.id === "string") outline.anchors.push(el.properties.id);
        if (el.tagName === "a" && typeof el.properties.href === "string")
          link(el.properties.href, line);
        return;
      }
      if (node.type !== "mdxJsxFlowElement" && node.type !== "mdxJsxTextElement") return;
      const jsx = node as MdxJsxFlowElementHast;
      if (jsx.name && /^[A-Z]/.test(jsx.name)) components.add(jsx.name);
      if (jsx.name === "Excerpt") {
        const from = literal(jsx, "from");
        if (from) link(from, line);
      }
      if (jsx.name === "Ref") {
        const to = literal(jsx, "to");
        if (to) outline.refs.push({ to, line });
        return;
      }
      const kind = jsx.name ? numberedComponents[jsx.name] : undefined;
      if (!kind) return;
      const id = literal(jsx, "id");
      const caption = literal(jsx, "caption");
      if (id) outline.anchors.push(id);
      if (id && caption) outline.numbered.push({ kind, id, caption });
    });

    if (isPage(file.path) && titles.length !== 1)
      throw new Error(
        `${file.path}: a page has exactly one # heading, its title; found ${titles.length}.`,
      );
    outline.title = titles[0] ?? "";
    compiled.set(file.path, { outline, components: [...components] });

    const ids = new Map<string, string>();
    for (const [kind, id] of [
      ...outline.headings.map((h) => ["heading", h.id] as const),
      ...outline.numbered.map((f) => [f.kind, f.id] as const),
    ]) {
      const other = ids.get(id);
      if (other)
        throw new Error(
          `${file.path}: ${other} and ${kind} both use the anchor "#${id}". Give one of them a different id.`,
        );
      ids.set(id, kind);
    }

    tree.children.unshift({
      type: "mdxjsEsm",
      value: "",
      data: {
        estree: {
          type: "Program",
          sourceType: "module",
          body: [
            {
              type: "ExportNamedDeclaration",
              specifiers: [],
              attributes: [],
              declaration: {
                type: "VariableDeclaration",
                kind: "const",
                declarations: [
                  {
                    type: "VariableDeclarator",
                    id: { type: "Identifier", name: "outline" },
                    init: valueToEstree(outline),
                  },
                ],
              },
            },
          ],
        },
      },
    } as unknown as Root["children"][number]);
  };
}
