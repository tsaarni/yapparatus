/**
 * The texts of a Plot drawing with the boxes they cover, by axis: what margins and overlap
 * checks read instead of a browser's layout.
 */
import type { Measure } from "../figure/font.ts";
import { type Box, boundsOf, type ChartFont, type Quad, textQuads } from "./text-box.ts";

/** The position scales Plot draws an axis for. */
export const axes = ["x", "y", "fx", "fy"] as const;
/** A position scale with an axis. */
export type Axis = (typeof axes)[number];

/** One text of a drawing: its characters, the rectangles it covers, and their bounds. */
export interface Label {
  text: string;
  quads: Quad[];
  box: Box;
}

/** A drawing's texts: all of them, and the tick labels and label of each axis. */
export interface Labels {
  all: Label[];
  ticks: Record<Axis, Label[]>;
  titles: Partial<Record<Axis, Label>>;
}

/** Is this the sign Plot adds when it warns, which a chart takes out? */
export function isWarningSign(text: Element): boolean {
  return text.firstChild?.textContent?.startsWith("⚠") ?? false;
}

/** The characters a `<text>` shows: its own and its tspans', without its tooltip. */
function shown(text: Element): string {
  return [...text.childNodes]
    .filter((n) => n.nodeType === 3 || (n as Element).tagName?.toLowerCase() === "tspan")
    .map((n) => n.textContent ?? "")
    .join(" ");
}

/** The texts of a Plot drawing with their boxes, without Plot's warning sign. */
export function labelsOf(svg: Element, font: ChartFont, measure: Measure): Labels {
  const read = (text: Element): Label | undefined => {
    const quads = textQuads(text, font, measure);
    const box = boundsOf(quads);
    return box && { text: shown(text), quads, box };
  };
  const all = [...svg.querySelectorAll("text")]
    .filter((text) => !isWarningSign(text))
    .map(read)
    .filter((label) => label !== undefined);
  const within = (name: string) =>
    [...svg.querySelectorAll(`[aria-label="${name}"] text`)]
      .map(read)
      .filter((label) => label !== undefined);
  const ticks = Object.fromEntries(axes.map((a) => [a, within(`${a}-axis tick label`)]));
  const titles = Object.fromEntries(
    axes.flatMap((a) => within(`${a}-axis label`).map((label) => [a, label])),
  );
  return { all, ticks: ticks as Labels["ticks"], titles };
}
