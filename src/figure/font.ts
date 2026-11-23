/** The fonts of figures, and how a figure measures its text: in the browser or from font files. */

/** A font as the measurer sees it: CSS family, size in units, and weight. */
export interface FontSpec {
  family: string;
  size: number;
  weight: number;
  /** Digits all as wide, as CSS `font-variant-numeric: tabular-nums` sets them. */
  tabular?: boolean;
}

/** Text width, injected: the server measures with the font files, tests use a fixed advance. */
export type Measure = (text: string, font: FontSpec) => number;
