/**
 * Line numbers in source file code are links, as on GitHub. In the file view, a click selects
 * the line and a shift-click extends the selection to a range; the address gets `#L11-L14`,
 * and the lines become a text selection, so the selection menu offers Ask and Copy link. In an
 * excerpt, a click opens the file at that line.
 */
import type { MouseEvent } from "react";
import type { LineRange } from "../files.ts";
import type { SourceFileCode } from "./prose.tsx";
import { fileHref, navigate } from "./router.ts";

/** Where a range started, so shift-clicks extend from the line clicked first. */
let anchor: { region: Element; line: number } | undefined;

/** The line whose number the pointer is on, or undefined when it is on the code. */
function lineNumberAt(event: MouseEvent): HTMLElement | undefined {
  const line = (event.target as Element | null)?.closest?.<HTMLElement>("[data-line]");
  if (!line) return;
  const style = getComputedStyle(line);
  const number = getComputedStyle(line, "::before");
  // A wrapped line's number hangs into its padding with a negative margin.
  const end =
    line.getBoundingClientRect().left +
    Number.parseFloat(style.borderLeftWidth) +
    Number.parseFloat(style.paddingLeft) +
    (Number.parseFloat(number.marginLeft) || 0) +
    (Number.parseFloat(number.width) || 0);
  return event.clientX <= end ? line : undefined;
}

/** Keep the browser from starting a text selection when a line number is pressed. */
export function pressLineNumber(event: MouseEvent) {
  if (lineNumberAt(event)) event.preventDefault();
}

export function clickLineNumber(event: MouseEvent, code: SourceFileCode) {
  const line = lineNumberAt(event);
  const region = line?.closest("[data-file]");
  if (!line || !region) return;
  event.preventDefault();
  const n = Number(line.dataset.line);
  const file = { folder: code.file.folder, path: code.file.path };
  if (!code.whole) {
    navigate(fileHref({ ...file, lines: { start: n, end: n } }));
    return;
  }
  const from = event.shiftKey && anchor?.region === region ? anchor.line : n;
  if (!event.shiftKey || anchor?.region !== region) anchor = { region, line: n };
  const lines = { start: Math.min(from, n), end: Math.max(from, n) };
  navigate(fileHref({ ...file, lines }), { replace: true });
  selectLines(region, lines);
}

/** Make the lines the text selection, which shows the selection menu beside them. */
function selectLines(region: Element, lines: LineRange) {
  const first = region.querySelector(`[data-line="${lines.start}"]`);
  const last = region.querySelector(`[data-line="${lines.end}"]`);
  const selection = window.getSelection();
  if (!first || !last || !selection) return;
  const range = document.createRange();
  range.setStart(first, 0);
  range.setEnd(last, last.childNodes.length);
  selection.removeAllRanges();
  selection.addRange(range);
}
