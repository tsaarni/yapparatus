/** Selecting text on a page as a reader would, and the selection menu that opens on it. */
import type { Locator, Page } from "@playwright/test";
import type { Reference } from "../../src/document/reference.ts";

/** Select everything inside the element `target` finds. */
export async function selectContents(target: Locator) {
  await target.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
  });
}

/** The menu that opens on a text selection. */
export function selectionMenu(page: Page): Locator {
  return page.getByRole("toolbar", { name: "Selection actions" });
}

/** Add the current selection to the chat message as a reference. */
export async function commentOnSelection(page: Page) {
  await selectionMenu(page).getByRole("button", { name: "Comment", exact: true }).click();
}

/** The references the chat message holds, as the browser stores them. */
export function storedReferences(page: Page): Promise<Reference[]> {
  return page.evaluate(
    () => JSON.parse(sessionStorage.getItem("yapparatus:references") ?? "[]") as Reference[],
  );
}
