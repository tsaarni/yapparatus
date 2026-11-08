/** Turning what the reader points at on the page into context items. */

import { contentDir, type DocumentPage, settings } from "virtual:yapparatus/document";
import { useEffect, useState } from "react";
import { partSeparator, textFragment } from "../document.ts";
import {
  type FileAddress,
  fileAddress,
  fileSource,
  foldersOf,
  type LineRange,
  parseFileAddress,
} from "../files.ts";
import type { ContextItem, TargetKind } from "../protocol.ts";
import { addressOf } from "./router.ts";

const excerptLength = 400;

/** The innermost element the compiler gave a source range: a block, list item, or table row. */
function blockOf(node: Node) {
  const element = node instanceof Element ? node : node.parentElement;
  return element?.closest<HTMLElement>("main article [data-source]") ?? undefined;
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

function sourceOf(block: HTMLElement) {
  const { source, hash, startLine, endLine } = block.dataset;
  if (!source || !hash || !startLine || !endLine) return;
  return { source, startLine: Number(startLine), endLine: Number(endLine), hash };
}

function excerpt(text: string) {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > excerptLength ? `${clean.slice(0, excerptLength)}…` : clean;
}

/** A context item for a whole target: a page, section, figure, table, listing, code, or diagram part. */
export function contextFromTarget(element: Element, page: DocumentPage): ContextItem | undefined {
  const target = element.closest<HTMLElement>("[data-target]");
  const block = target && blockOf(target);
  const source = block && sourceOf(block);
  if (!target || !source) return;
  const kind = target.dataset.target as TargetKind;
  const figure =
    kind === "diagram-part" ? target.closest<HTMLElement>("[data-target=figure]") : null;
  const anchor =
    kind === "page"
      ? undefined
      : kind === "diagram-part"
        ? figure?.id && `${figure.id}${partSeparator}${target.dataset.elementId}`
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

/** The part of `range` inside `node`. */
function clip(range: Range, node: Node): Range {
  const part = document.createRange();
  part.selectNodeContents(node);
  if (part.compareBoundaryPoints(Range.START_TO_START, range) < 0)
    part.setStart(range.startContainer, range.startOffset);
  if (part.compareBoundaryPoints(Range.END_TO_END, range) > 0)
    part.setEnd(range.endContainer, range.endOffset);
  return part;
}

/**
 * One text item per source range the selection touches: each block, list item, or table row,
 * addressed by its section with the selected words as a text fragment.
 */
export function contextsFromRange(range: Range, page: DocumentPage): ContextItem[] {
  const article = document.querySelector("main article");
  if (!article) return [];
  const spans = new Map<HTMLElement, Range>();
  const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!range.intersectsNode(node) || node.parentElement?.closest(".target-actions")) continue;
    // Source code becomes lines of its file; see `fileContextsFromRange`.
    if (node.parentElement?.closest("[data-file]")) continue;
    const part = clip(range, node);
    const block = blockOf(node);
    if (!block || !part.toString().trim()) continue;
    const span = spans.get(block);
    if (span) span.setEnd(part.endContainer, part.endOffset);
    else spans.set(block, part);
  }
  return [...spans].flatMap(([block, span]) => {
    const source = sourceOf(block);
    const words = span.toString().trim();
    if (!source || !words) return [];
    const section = addressOf(page, sectionOf(block)?.id);
    return [
      {
        kind: "text" as const,
        address: `${section}${section.includes("#") ? "" : "#"}${textFragment(words)}`,
        ...source,
      },
    ];
  });
}

/* ---------- Source files ---------- */

/**
 * The server's block hash: the first 16 hex digits of the SHA-256 of the lines joined by
 * newlines. The browser computes it from the code it shows, whose lines are the file's.
 */
export async function linesHash(lines: string[]): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(lines.join("\n")));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

/** The lines of a source file's code block, by their number in the file. */
export function shownLines(region: Element): Map<number, string> {
  const lines = new Map<number, string>();
  for (const line of region.querySelectorAll<HTMLElement>("[data-line]"))
    lines.set(Number(line.dataset.line), line.textContent ?? "");
  return lines;
}

/** The file a source file's code block shows, without lines. */
function fileOf(region: HTMLElement): FileAddress | undefined {
  return parseFileAddress(region.dataset.file ?? "");
}

/** Code selected in a source file's code block: its lines, and its words when not all of them. */
export interface CodeSelection {
  region: HTMLElement;
  lines: LineRange;
  /** The selected text, when it leaves out part of the lines. */
  words?: string;
}

/**
 * The address of selected code: the file and lines, with the words as a text fragment when
 * the selection leaves out part of the lines, "/-/files/app/x.ts#L2:~:text=retry".
 */
export function codeAddress({ region, lines, words }: CodeSelection): string | undefined {
  const file = fileOf(region);
  return file && `${fileAddress({ ...file, lines })}${words ? textFragment(words) : ""}`;
}

/** A context item for a whole source file, or for code in it, from the code that shows them. */
export async function fileContext(
  region: HTMLElement,
  selected?: CodeSelection,
): Promise<ContextItem | undefined> {
  const lines = selected?.lines;
  const file = fileOf(region);
  const source = file && fileSource(contentDir, foldersOf(settings), file);
  if (!file || !source) return;
  const shown = shownLines(region);
  const range = lines ?? { start: 1, end: shown.size };
  const text: string[] = [];
  for (let n = range.start; n <= range.end; n++) {
    const line = shown.get(n);
    if (line === undefined) return;
    text.push(line);
  }
  return {
    kind: lines ? "lines" : "file",
    address: (selected && codeAddress(selected)) ?? fileAddress(file),
    source,
    startLine: range.start,
    endLine: range.end,
    hash: await linesHash(text),
  };
}

/**
 * The code a selection touches in each source file code block: the lines whose selected text
 * is more than white space, and the selected words when they leave out part of those lines.
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
      const part = range.intersectsNode(line) ? clip(range, line).toString() : "";
      if (!part.trim()) continue;
      const n = Number(line.dataset.line);
      lines = lines ? { start: lines.start, end: n } : { start: n, end: n };
      whole.push(line.textContent ?? "");
      picked.push(part);
    }
    if (!lines) continue;
    const words = flat(picked.join(" "));
    found.push({ region, lines, ...(words !== flat(whole.join(" ")) ? { words } : {}) });
  }
  return found;
}

/** One lines item for each source file code block the selection touches. */
export async function fileContextsFromRange(range: Range): Promise<ContextItem[]> {
  const items = await Promise.all(
    selectedCode(range).map((selected) => fileContext(selected.region, selected)),
  );
  return items.filter((item) => item !== undefined);
}

/**
 * Where an earlier lines item's lines are now in the code shown: the same lines if they still
 * hash the same, else the one run of lines that does, else undefined. The server places
 * items for the agent the same way.
 */
export async function relocateLines(
  region: Element,
  item: ContextItem,
): Promise<LineRange | undefined> {
  const shown = shownLines(region);
  const length = item.endLine - item.startLine + 1;
  const holds = async (start: number) => {
    const text: string[] = [];
    for (let n = start; n < start + length; n++) {
      const line = shown.get(n);
      if (line === undefined) return false;
      text.push(line);
    }
    return (await linesHash(text)) === item.hash;
  };
  if (await holds(item.startLine)) return { start: item.startLine, end: item.endLine };
  const found: number[] = [];
  for (let start = 1; start + length - 1 <= shown.size && found.length < 2; start++)
    if (await holds(start)) found.push(start);
  const [start] = found;
  return found.length === 1 && start !== undefined ? { start, end: start + length - 1 } : undefined;
}

/** The diagram part under an event target, as a context item. */
export function contextFromDiagram(
  target: EventTarget | null,
  page: DocumentPage,
): ContextItem | undefined {
  if (!(target instanceof Element)) return;
  const part = target.closest("[data-target=diagram-part]");
  return part ? contextFromTarget(part, page) : undefined;
}

export interface SelectionMenu {
  range: Range;
  x: number;
  y: number;
}

/** Track text selections inside the article and where to show the Ask menu. */
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
      // Beside the end of prose, where it covers nothing; under code, whose lines it would cover.
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
