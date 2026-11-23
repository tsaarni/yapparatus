/**
 * A figure as a standalone SVG picture for an agent: its type, how its text becomes outlines, and
 * the legend under it, laid out as the web app lays out its legend buttons.
 */
import type { FontSpec, Measure } from "./font.ts";

/** Text as glyph outlines: path data for text that starts at x with its central baseline at y. */
export type TextOutline = (text: string, font: FontSpec, x: number, y: number) => string;

/** How a picture draws text: the widths, and the outlines. */
export interface PictureFonts {
  measure: Measure;
  outline: TextOutline;
}

/** A drawn picture: the SVG text and its size. */
export interface Picture {
  svg: string;
  /** The picture's size in CSS pixels: the figure, and the legend under it. */
  width: number;
  height: number;
}

/** The legend under a figure, in pixels, as the web app's legend buttons are laid out. */
export const legend = {
  marginTop: 12,
  height: 28,
  padX: 8,
  gap: 4,
  swatch: { width: 14, height: 10, radius: 3 },
  font: { size: 12, weight: 500 },
} as const;

/** Where a legend entry is drawn: its swatch's left edge, its words' start, and its middle. */
export interface LegendPlace {
  swatchX: number;
  wordsX: number;
  middle: number;
}

/**
 * The places of legend entries in rows as wide as the figure, from the legend's top left, and the
 * legend's height.
 */
export function legendLayout(
  names: readonly string[],
  width: number,
  family: string,
  measure: Measure,
): { places: LegendPlace[]; height: number } {
  const { swatch } = legend;
  const font = { family, ...legend.font };
  const places: LegendPlace[] = [];
  let [x, y]: [number, number] = [0, legend.marginTop];
  for (const name of names) {
    const button = legend.padX * 2 + swatch.width + legend.gap + measure(name, font);
    if (x > 0 && x + button > width) [x, y] = [0, y + legend.height + legend.gap];
    places.push({
      swatchX: x + legend.padX,
      wordsX: x + legend.padX + swatch.width + legend.gap,
      middle: y + legend.height / 2,
    });
    x += button + legend.gap;
  }
  return { places, height: names.length ? y + legend.height : 0 };
}
