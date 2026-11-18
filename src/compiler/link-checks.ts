/** Checks that every link and reference in the document points at something that exists. */

import { elementSeparator, resolveLink } from "../document/address.ts";
import type { DiagnosticCode } from "../document/diagnostic.ts";
import { type FileAddress, linesLabel } from "../document/file-address.ts";
import type { PageOutline } from "../document/page-module.ts";

/** A fragment's anchor, without the text fragment that may follow it: "id:~:text=…" → "id". */
function anchorOf(fragment: string): string {
  return fragment.split(":~:")[0] ?? "";
}

export interface LinkDiagnostic {
  page: string;
  line: number;
  code: DiagnosticCode;
  /** The link, reference, or id the diagnostic is about. */
  subject: string;
  message: string;
}

/** How many lines a source file has, or why it cannot be shown. */
export type FileLines = (file: FileAddress) => { lines: number } | { error: string };

/**
 * Every internal link and reference must point at something that exists: a page and anchor,
 * or a source file and lines inside it.
 */
export function checkLinks(
  pages: Array<{ id: string; outline: PageOutline }>,
  fileLines: FileLines,
): LinkDiagnostic[] {
  const broken: LinkDiagnostic[] = [];
  const ids = pages.map((p) => p.id);
  const byId = new Map(pages.map((p) => [p.id, p.outline]));
  const numberedOwner = new Map<string, string>();
  for (const page of pages)
    for (const block of page.outline.numbered) {
      const owner = numberedOwner.get(block.id);
      if (owner && owner !== page.id)
        broken.push({
          page: page.id,
          line: 1,
          code: "DUPLICATE_ID",
          subject: block.id,
          message: `The id "${block.id}" is also used in ${owner}.mdx; references to it go there.`,
        });
      else numberedOwner.set(block.id, page.id);
    }
  const anchorExists = (page: string, fragment: string) => {
    if (!fragment || fragment.startsWith(":~:")) return true;
    const anchors = byId.get(page)?.anchors ?? [];
    const [base = ""] = fragment.split(elementSeparator);
    return anchors.includes(fragment) || anchors.includes(base);
  };
  for (const page of pages) {
    for (const { href, line } of page.outline.links) {
      const resolved = resolveLink(href, page.id, ids);
      if (resolved === "external") continue;
      if (resolved && "file" in resolved) {
        const found = fileLines(resolved.file);
        const { lines } = resolved.file;
        if ("error" in found)
          broken.push({
            page: page.id,
            line,
            code: "BROKEN_LINK",
            subject: href,
            message: `The link "${href}" names no file it can show: ${found.error}`,
          });
        else if (lines && lines.end > found.lines)
          broken.push({
            page: page.id,
            line,
            code: "BROKEN_LINK",
            subject: href,
            message: `The link "${href}" names lines ${linesLabel(lines)}, but the file has ${found.lines} lines.`,
          });
        continue;
      }
      if (!resolved)
        broken.push({
          page: page.id,
          line,
          code: "BROKEN_LINK",
          subject: href,
          message: href.startsWith("/-/files/")
            ? `The link "${href}" is not a file address. Write /-/files/<directory>/<path>#L10-L20.`
            : `No page matches the link "${href}".`,
        });
      else if (!anchorExists(resolved.page, anchorOf(resolved.fragment)))
        broken.push({
          page: page.id,
          line,
          code: "BROKEN_LINK",
          subject: href,
          message: `The link "${href}" names #${anchorOf(resolved.fragment)}, which ${resolved.page}.mdx does not have.`,
        });
    }
    for (const { to: written, line } of page.outline.refs) {
      // A diagram element or step is checked by its figure; the diagram checks the rest.
      const [to = ""] = written.split(elementSeparator);
      const [slug = "", fragment = ""] = to.slice(1).split("#");
      const exists = to.startsWith("/")
        ? ids.includes(slug) && anchorExists(slug, fragment)
        : numberedOwner.has(to) || (byId.get(page.id)?.anchors ?? []).includes(to);
      if (!exists)
        broken.push({
          page: page.id,
          line,
          code: "BROKEN_REF",
          subject: written,
          message: `<Ref to="${written}" /> points at nothing.`,
        });
    }
  }
  return broken;
}
