/**
 * Chapter, section, and figure numbers for the whole document, computed from the outlines
 * that each page exports, and again whenever a page changes. Anchors never depend on numbers.
 */

import { type DocumentPage, onPagesChanged, pages, settings } from "virtual:yapparatus/document";
import { createContext, useContext } from "react";
import { type NumberedKind, numberingOf } from "../document.ts";
import { createLogger } from "../logger.ts";

const log = createLogger("numbering");

export const numbering = numberingOf(settings);

export interface PageNumbers {
  chapter: string;
  sections: Map<string, string>;
  /** Figure, table, and listing numbers by id. Each kind counts separately. */
  blocks: Map<string, string>;
}

/** The label word for each numbered kind. */
export const kindLabel: Record<NumberedKind, string> = {
  figure: "Figure",
  table: "Table",
  listing: "Listing",
};

const kindEnabled: Record<NumberedKind, boolean> = {
  figure: numbering.figures,
  table: numbering.tables,
  listing: numbering.listings,
};

/** "Table 3.1" when that kind is numbered, else undefined. */
export function blockLabel(
  kind: NumberedKind,
  page: DocumentPage | undefined,
  id: string | undefined,
) {
  const number = id && kindEnabled[kind] ? numbersOf(page)?.blocks.get(id) : undefined;
  return number ? `${kindLabel[kind]} ${number}` : undefined;
}

export interface Target {
  page: DocumentPage;
  fragment: string;
  /** "Figure 3.1", "Section 3.2", "Chapter 3", or the caption, heading, or title without numbering. */
  label: string;
}

const byPage = new Map<DocumentPage, PageNumbers>();
const targets = new Map<string, Target>();

function computeNumbers() {
  byPage.clear();
  targets.clear();
  pages.forEach(numberPage);
}

function numberPage(page: DocumentPage, index: number) {
  const chapter = String(index + 1);
  const sections = new Map<string, string>();
  const blocks = new Map<string, string>();
  const counters: Record<NumberedKind, number> = { figure: 0, table: 0, listing: 0 };
  let h2 = 0;
  let h3 = 0;
  targets.set(`/${page.id}`, {
    page,
    fragment: "",
    label: numbering.sections ? `Chapter ${chapter}` : (page.outline?.title ?? page.id),
  });
  for (const heading of page.outline?.headings ?? []) {
    if (heading.depth === 2) {
      h2++;
      h3 = 0;
      sections.set(heading.id, `${chapter}.${h2}`);
    } else {
      h3++;
      sections.set(heading.id, h2 ? `${chapter}.${h2}.${h3}` : `${chapter}.0.${h3}`);
    }
    targets.set(`${page.id}#${heading.id}`, {
      page,
      fragment: heading.id,
      label: numbering.sections ? `Section ${sections.get(heading.id)}` : heading.text,
    });
  }
  for (const block of page.outline?.numbered ?? []) {
    const number = `${chapter}.${++counters[block.kind]}`;
    blocks.set(block.id, number);
    if (targets.has(block.id)) {
      if (import.meta.env.DEV)
        log.warn(`The id "${block.id}" is used on more than one page; references go to the first.`);
      continue;
    }
    targets.set(block.id, {
      page,
      fragment: block.id,
      label: kindEnabled[block.kind] ? `${kindLabel[block.kind]} ${number}` : block.caption,
    });
  }
  byPage.set(page, { chapter, sections, blocks });
}

computeNumbers();
// A page edited in place can add or remove sections and figures.
onPagesChanged(computeNumbers);

export function numbersOf(page: DocumentPage | undefined): PageNumbers | undefined {
  return page ? byPage.get(page) : undefined;
}

/**
 * Find a reference target: a figure, table, or listing id anywhere in the document, a heading id
 * on the current page, or an address on any page: "/page" or "/page#id".
 */
export function findTarget(to: string, from: DocumentPage | undefined): Target | undefined {
  if (to.startsWith("/")) {
    const [slug = "", fragment = ""] = to.slice(1).split("#");
    if (!fragment) return targets.get(`/${slug}`);
    const block = targets.get(fragment);
    return block?.page.id === slug ? block : targets.get(`${slug}#${fragment}`);
  }
  return targets.get(to) ?? (from ? targets.get(`${from.id}#${to}`) : undefined);
}

/** The page being rendered, or undefined inside a chat reply. */
export const PageContext = createContext<DocumentPage | undefined>(undefined);
export function usePage() {
  return useContext(PageContext);
}
