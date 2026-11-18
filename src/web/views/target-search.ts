import { elementSeparator, splitAddress } from "../../document/address.ts";
import type { Reference } from "../../document/reference.ts";

/**
 * The elements on the page that an earlier reference points at, found by its address: the
 * id it names, and the element or the selected words in it. Text and code have no id of their own,
 * so they are the blocks of the item's page that hold the words or code; among several, those
 * at the item's lines, where they are while the page has not changed since.
 */
export function findReferenced(item: Reference): Element[] {
  const { anchor, text } = splitAddress(item.address);
  if (item.kind === "page")
    return [...document.querySelectorAll("main article [data-target=page]")];
  if (item.kind === "diagram-element") {
    const at = anchor.indexOf(elementSeparator);
    const figure = document.getElementById(anchor.slice(0, at));
    const id = anchor.slice(at + elementSeparator.length);
    return figure ? [...figure.querySelectorAll(`[data-element-id="${CSS.escape(id)}"]`)] : [];
  }
  if (item.kind !== "text" && item.kind !== "code") {
    const element = anchor ? document.getElementById(anchor) : null;
    return element?.dataset.target === item.kind ? [element] : [];
  }
  const blocks = [...document.querySelectorAll<HTMLElement>("main article [data-source]")].filter(
    (block) => block.dataset.source === item.source,
  );
  const flat = (words: string | null | undefined) => (words ?? "").replace(/\s+/g, " ");
  const holds = (block: Element) => {
    const content = flat(block.textContent);
    return !!text && content.includes(text.start) && content.includes(text.end ?? "");
  };
  const found =
    item.kind === "text"
      ? blocks.filter(
          (block) =>
            holds(block) &&
            !blocks.some((inner) => inner !== block && block.contains(inner) && holds(inner)),
        )
      : [...new Set(blocks.flatMap((block) => [...block.querySelectorAll("[data-target=code]")]))];
  // A text item's lines are in its block; a code item's are its code's lines.
  const at = found.filter((element) => {
    const lines =
      item.kind === "code"
        ? [...element.querySelectorAll<HTMLElement>("[data-source-line]")].map((line) =>
            Number(line.dataset.sourceLine),
          )
        : [
            Number(element.getAttribute("data-start-line")),
            Number(element.getAttribute("data-end-line")),
          ];
    return (lines[0] ?? 0) <= item.startLine && item.endLine <= (lines.at(-1) ?? 0);
  });
  return at.length ? at : found;
}

/** Run `found` once `find` returns an element, retrying briefly while diagrams render. */
export function whenPresent<T extends Element>(
  find: () => T | null | undefined,
  found: (element: T) => void,
  missing?: () => void,
  tries = 12,
) {
  const element = find();
  if (element) found(element);
  else if (tries > 0) window.setTimeout(() => whenPresent(find, found, missing, tries - 1), 100);
  else missing?.();
}
