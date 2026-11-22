/** The stage that records a page's outline: title, headings, numbered blocks, anchors, links. */
import { valueToEstree } from "estree-util-value-to-estree";
import type { Element, Root } from "hast";
import { toString as textOf } from "hast-util-to-string";
import type { MdxJsxFlowElementHast } from "mdast-util-mdx-jsx";
import { visit } from "unist-util-visit";
import type { NumberedKind, PageOutline } from "../../document/page-module.ts";
import { pageRevision } from "../revision.ts";
import { contentIssues, literal } from "./conventions.ts";
import { excerptFiles } from "./excerpts.ts";

/** Which MDX components are numbered blocks, and of which kind. */
export const numberedComponents: Record<string, NumberedKind> = {
  Chart: "figure",
  Diagram: "figure",
  Figure: "figure",
  Table: "table",
  Listing: "listing",
};

/** The lines of a component with an id, such as a figure, in its page's source. */
export interface Place {
  start: number;
  end: number;
}

/**
 * Each compiled file's outline, capitalized components, and lines of components with ids, by path.
 * The dev server reads them to check an agent's reply and to place diagnostics about figures.
 */
export const compiled = new Map<
  string,
  { outline: PageOutline; components: string[]; places: Record<string, Place> }
>();

/**
 * Export the page's sections and figures as `outline`, for numbering and cross-references.
 * `isPage` tells document pages, which must have one `#` title, from chat replies, which have none.
 */
export function pageOutline(isPage: (file: string) => boolean) {
  return (tree: Root, file: { path: string; value: unknown }) => {
    const outline: PageOutline = {
      revision: pageRevision(String(file.value), excerptFiles.get(file.path) ?? []),
      title: "",
      headings: [],
      numbered: [],
      anchors: [],
      links: [],
      refs: [],
    };
    const titles: string[] = [];
    const anchored: Array<{ kind: string; id: string; line: number }> = [];
    const components = new Set<string>();
    const places: Record<string, Place> = {};
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
          anchored.push({ kind: "heading", id: el.properties.id, line });
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
      if (id && jsx.position)
        places[id] = { start: jsx.position.start.line, end: jsx.position.end.line };
      if (id && caption) {
        outline.numbered.push({ kind, id, caption });
        anchored.push({ kind, id, line });
      }
    });

    if (isPage(file.path) && titles.length !== 1)
      throw new Error(
        `${file.path}: a page has exactly one # heading, its title; found ${titles.length}.`,
      );
    outline.title = titles[0] ?? "";
    compiled.set(file.path, { outline, components: [...components], places });

    const ids = new Map<string, string>();
    const issues = contentIssues.get(file.path) ?? [];
    contentIssues.set(file.path, issues);
    for (const { kind, id, line } of anchored) {
      const other = ids.get(id);
      if (other)
        issues.push({
          code: "DUPLICATE_ID",
          line,
          subject: id,
          message: `A ${other} and a ${kind} both use the anchor "#${id}"; links go to the first. Give one of them a different id.`,
        });
      else ids.set(id, kind);
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
