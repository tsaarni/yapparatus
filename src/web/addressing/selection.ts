/** Turning what the reader points at on the page into references. */

import { contentDir, type DocumentPage, settings } from "virtual:yapparatus/document";
import { useEffect, useState } from "react";
import { elementSeparator, textFragment } from "../../document/address.ts";
import {
  type FileAddress,
  fileAddress,
  fileSource,
  foldersOf,
  type LineRange,
  parseFileAddress,
} from "../../document/file-address.ts";
import type { Reference, TargetKind } from "../../document/reference.ts";
import { addressOf } from "./router.ts";

const excerptLength = 400;

/** The innermost element the compiler gave a source range: a block, list item, or table row. */
function blockOf(node: Node) {
  const element = node instanceof Element ? node : node.parentElement;
  return element?.closest<HTMLElement>("main article [data-source]") ?? undefined;
}

/**
 * The element with an id that selected words are in: the figure, table, or listing around
 * them, else the section they are under.
 */
function anchorOf(node: Node, block: Element): string | undefined {
  const element = node instanceof Element ? node : node.parentElement;
  const owner = element?.closest<HTMLElement>(
    "main article [data-target][id]:not([data-target=page]):not([data-target=section])",
  );
  return owner?.id || sectionOf(block)?.id;
}

/** The section heading a block sits under, if it has an id. */
function sectionOf(block: Element): HTMLElement | undefined {
  let found: HTMLElement | undefined;
  for (const heading of document.querySelectorAll<HTMLElement>(
    "main article [data-target=section][id]",
  ))
    if (heading.compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING) found = heading;
  return found;
}

/** The page file and lines the compiler recorded on a block. */
function sourceOf(block: HTMLElement) {
  const { source, startLine, endLine } = block.dataset;
  if (!source || !startLine || !endLine) return;
  return { source, startLine: Number(startLine), endLine: Number(endLine) };
}

/** The lines of a page's code inside `element`, by their line in the page. */
function pageCodeLines(element: Element): HTMLElement[] {
  return [...element.querySelectorAll<HTMLElement>("[data-source-line]")];
}

/** The first and last of these code lines, as lines of the page. */
function linesOf(lines: HTMLElement[]): LineRange | undefined {
  const numbers = lines.map((line) => Number(line.dataset.sourceLine));
  const [first] = numbers;
  return first === undefined ? undefined : { start: first, end: numbers.at(-1) ?? first };
}

/**
 * The last line of a section: the line before the next heading of the same or a higher level,
 * or the end of the page's last block.
 */
function sectionEnd(heading: HTMLElement, block: HTMLElement): number {
  const level = Number(heading.tagName.slice(1));
  const headings = [
    ...document.querySelectorAll<HTMLElement>("main article [data-target=section]"),
  ];
  const next = headings
    .slice(headings.indexOf(heading) + 1)
    .find((other) => Number(other.tagName.slice(1)) <= level);
  const after = next && blockOf(next);
  if (after) return Number(after.dataset.startLine) - 1;
  const blocks = document.querySelectorAll<HTMLElement>(
    `main article [data-source="${CSS.escape(block.dataset.source ?? "")}"]`,
  );
  return Math.max(...[...blocks].map((b) => Number(b.dataset.endLine)));
}

/** Text with white space collapsed, cut to the excerpt length. */
function excerpt(text: string) {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > excerptLength ? `${clean.slice(0, excerptLength)}…` : clean;
}

/**
 * A reference for a whole target: a page, section, figure, table, listing, code, or diagram
 * element. A section runs to the next heading of its level; code covers only its code's lines.
 */
export function referenceFromTarget(element: Element, page: DocumentPage): Reference | undefined {
  const target = element.closest<HTMLElement>("[data-target]");
  const block = target && blockOf(target);
  const source = block && sourceOf(block);
  if (!target || !source) return;
  const kind = target.dataset.target as TargetKind;
  if (kind === "section") source.endLine = sectionEnd(target, block);
  const code = kind === "code" ? linesOf(pageCodeLines(target)) : undefined;
  if (code) Object.assign(source, { startLine: code.start, endLine: code.end });
  const figure =
    kind === "diagram-element" ? target.closest<HTMLElement>("[data-target=figure]") : null;
  const anchor =
    kind === "page"
      ? undefined
      : kind === "diagram-element"
        ? figure?.id && `${figure.id}${elementSeparator}${target.dataset.elementId}`
        : target.id || sectionOf(block)?.id;
  const step = openStep(figure ?? target);
  return { kind, address: addressOf(page, anchor), ...source, ...(step ? { step } : {}) };
}

/** The step a figure's reader has open, with its text, as the agent should see it. */
function openStep(figure: Element): string | undefined {
  const controls = figure.querySelector<HTMLElement>(".diagram-steps[data-step]");
  if (!controls) return;
  const text = controls.querySelector("li[data-active]")?.textContent?.trim();
  return excerpt(`${controls.dataset.step}${text ? `: ${text}` : ""}`);
}

/** The range that `range` and `node` share. */
function clip(range: Range, node: Node): Range {
  const inside = document.createRange();
  inside.selectNodeContents(node);
  if (inside.compareBoundaryPoints(Range.START_TO_START, range) < 0)
    inside.setStart(range.startContainer, range.startOffset);
  if (inside.compareBoundaryPoints(Range.END_TO_END, range) > 0)
    inside.setEnd(range.endContainer, range.endOffset);
  return inside;
}

/**
 * One text reference per block, list item, or table row the selection touches, addressed by
 * what it is in, with the selected words as a text fragment.
 */
export function referencesFromRange(range: Range, page: DocumentPage): Reference[] {
  const article = document.querySelector("main article");
  if (!article) return [];
  const spans = new Map<HTMLElement, Range>();
  const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!range.intersectsNode(node) || node.parentElement?.closest(".target-actions")) continue;
    if (node.parentElement?.closest("[data-file]")) continue;
    const inside = clip(range, node);
    const block = blockOf(node);
    if (!block || !inside.toString().trim()) continue;
    const span = spans.get(block);
    if (span) span.setEnd(inside.endContainer, inside.endOffset);
    else spans.set(block, inside);
  }
  return [...spans].flatMap(([block, span]) => {
    const source = sourceOf(block);
    const words = span.toString().trim();
    if (!source || !words) return [];
    const code = linesOf(
      pageCodeLines(block).filter(
        (line) =>
          blockOf(line) === block &&
          span.intersectsNode(line) &&
          clip(span, line).toString().trim(),
      ),
    );
    const owner = addressOf(page, anchorOf(span.startContainer, block));
    return [
      {
        kind: "text" as const,
        address: `${owner}${owner.includes("#") ? "" : "#"}${textFragment(words)}`,
        ...source,
        ...(code ? { startLine: code.start, endLine: code.end } : {}),
      },
    ];
  });
}

/** The file a source file's code block shows, without lines. */
function fileOf(region: HTMLElement): FileAddress | undefined {
  return parseFileAddress(region.dataset.file ?? "");
}

/** Code selected in a source file's code block: its lines, and its words when not all of them. */
export interface CodeSelection {
  region: HTMLElement;
  lines: LineRange;
  /** The selected text, when it covers only some of the lines. */
  words?: string;
}

/**
 * The address of selected code: the file and lines, with the words as a text fragment when
 * the selection covers only some of the lines, "/-/files/app/x.ts#L2:~:text=retry".
 */
export function codeAddress({ region, lines, words }: CodeSelection): string | undefined {
  const file = fileOf(region);
  return file && `${fileAddress({ ...file, lines })}${words ? textFragment(words) : ""}`;
}

/** A reference for a whole source file, or for code in it, from the code that shows them. */
export function fileReference(
  region: HTMLElement,
  selected?: CodeSelection,
): Reference | undefined {
  const file = fileOf(region);
  const source = file && fileSource(contentDir, foldersOf(settings), file);
  if (!file || !source) return;
  const range = selected?.lines ?? {
    start: 1,
    end: region.querySelectorAll("[data-line]").length,
  };
  return {
    kind: selected ? "lines" : "file",
    address: (selected && codeAddress(selected)) ?? fileAddress(file),
    source,
    startLine: range.start,
    endLine: range.end,
  };
}

/**
 * The code a selection touches in each source file code block: the lines whose selected text
 * is more than white space, and the selected words when they cover only some of those lines.
 */
export function selectedCode(range: Range): CodeSelection[] {
  const found: CodeSelection[] = [];
  const flat = (text: string) => text.replace(/\s+/g, " ").trim();
  for (const region of document.querySelectorAll<HTMLElement>("main article [data-file]")) {
    if (!range.intersectsNode(region)) continue;
    let lines: LineRange | undefined;
    const whole: string[] = [];
    const picked: string[] = [];
    for (const line of region.querySelectorAll<HTMLElement>("[data-line]")) {
      const text = range.intersectsNode(line) ? clip(range, line).toString() : "";
      if (!text.trim()) continue;
      const n = Number(line.dataset.line);
      lines = lines ? { start: lines.start, end: n } : { start: n, end: n };
      whole.push(line.textContent ?? "");
      picked.push(text);
    }
    if (!lines) continue;
    const words = flat(picked.join(" "));
    found.push({ region, lines, ...(words !== flat(whole.join(" ")) ? { words } : {}) });
  }
  return found;
}

/** One lines item for each source file code block the selection touches. */
export function fileReferencesFromRange(range: Range): Reference[] {
  return selectedCode(range).flatMap((selected) => fileReference(selected.region, selected) ?? []);
}

/** The diagram element under an event target, as a reference. */
export function referenceFromDiagram(
  target: EventTarget | null,
  page: DocumentPage,
): Reference | undefined {
  if (!(target instanceof Element)) return;
  const element = target.closest("[data-target=diagram-element]");
  return element ? referenceFromTarget(element, page) : undefined;
}

/** The selected range and the viewport position where the selection menu shows. */
export interface SelectionMenu {
  range: Range;
  x: number;
  y: number;
}

/** Track text selections inside the article and where to show the selection menu. */
export function useSelectionMenu(enabled: boolean) {
  const [menu, setMenu] = useState<SelectionMenu>();
  useEffect(() => {
    if (!enabled) return;
    const dismiss = () => setMenu(undefined);
    let selecting = false;
    const update = () => {
      if (selecting) return;
      const selection = window.getSelection();
      const article = document.querySelector("main article");
      if (!selection || selection.isCollapsed || !selection.rangeCount || !article) {
        dismiss();
        return;
      }
      const range = selection.getRangeAt(0);
      if (
        !article.contains(range.startContainer) ||
        !article.contains(range.endContainer) ||
        !range.toString().trim()
      ) {
        dismiss();
        return;
      }
      const rects = [...range.getClientRects()].filter((rect) => rect.width && rect.height);
      const first = rects[0];
      const last = rects.at(-1);
      const viewportHeight = window.innerHeight;
      if (!first || !last || last.bottom < 0 || first.top > viewportHeight) {
        dismiss();
        return;
      }
      const backwards =
        selection.focusNode === range.startContainer && selection.focusOffset === range.startOffset;
      const anchor = backwards ? first : last;
      const articleRect = article.getBoundingClientRect();
      const minX = Math.max(12, articleRect.left);
      const maxX = Math.max(minX, Math.min(window.innerWidth - 100, articleRect.right - 88));
      let x = Math.max(minX, Math.min(anchor.right - 44, maxX));
      let y = anchor.bottom + 8;
      const panel = document.querySelector(".chat");
      const availableRight = panel ? panel.getBoundingClientRect().left : window.innerWidth;
      const container = range.commonAncestorContainer;
      const inCode = (container instanceof Element ? container : container.parentElement)?.closest(
        "[data-file]",
      );
      if (!inCode && anchor.right + 112 <= availableRight) {
        x = anchor.right + 12;
        y = anchor.bottom - 36;
      }
      if (y + 40 > viewportHeight - 12) y = first.top - 48;
      y = Math.max(64, Math.min(y, viewportHeight - 52));
      setMenu({ range: range.cloneRange(), x, y });
    };
    const pointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || event.target.closest(".selection-menu")) return;
      selecting = !!event.target.closest("main article");
      dismiss();
    };
    const pointerUp = () => {
      if (!selecting) return;
      selecting = false;
      update();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    document.addEventListener("selectionchange", update);
    document.addEventListener("pointerdown", pointerDown);
    document.addEventListener("pointerup", pointerUp);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", dismiss);
    window.addEventListener("popstate", dismiss);
    return () => {
      document.removeEventListener("selectionchange", update);
      document.removeEventListener("pointerdown", pointerDown);
      document.removeEventListener("pointerup", pointerUp);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("popstate", dismiss);
    };
  }, [enabled]);
  return { menu, dismiss: () => setMenu(undefined) };
}
