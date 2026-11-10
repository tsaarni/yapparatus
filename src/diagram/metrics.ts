/**
 * Measurements the compiler and the renderer share: fonts, metrics, and shape sizes.
 */

export interface FontSpec {
  family: string;
  size: number;
  weight: number;
}

/** Text measurement is injected: the browser uses canvas, tests use a fixed advance. */
export type Measure = (text: string, font: FontSpec) => number;

/**
 * Diagram type. Every text the compiler places gets one of these fonts, and the renderer
 * draws it with the font the compiler measured.
 */
export interface Metrics {
  /** For measurement. The renderer draws with the theme's font families. */
  sans: string;
  mono: string;
  /** Node labels. */
  labelSize: number;
  /** Everything else: sublabels, notes, record rows, edge labels, fragment titles. */
  smallSize: number;
  /** Enclosure titles and fragment operators, set in tabs. */
  tabSize: number;
  /** The interface's three weights: regular text, medium edge labels, semibold labels and tabs. */
  textWeight: number;
  edgeWeight: number;
  labelWeight: number;
  lineHeight: number;
  padX: number;
  padY: number;
  minWidth: number;
  minHeight: number;
  headLength: number;
  headWidth: number;
  margin: number;
}

export const defaultMetrics: Metrics = {
  sans: '"Inter Variable", sans-serif',
  mono: '"JetBrains Mono Variable", "SFMono-Regular", Menlo, monospace',
  labelSize: 13.5,
  smallSize: 12,
  tabSize: 11,
  textWeight: 400,
  edgeWeight: 500,
  labelWeight: 600,
  lineHeight: 1.38,
  padX: 16,
  padY: 11,
  minWidth: 104,
  minHeight: 46,
  headLength: 10,
  headWidth: 8,
  margin: 14,
};

/** Shape-specific measurements shared by sizing, layout, and anchors. */
export const shapes = {
  actor: { figure: 30, gap: 6 },
  note: { padX: 12, padY: 9, fold: 10 },
  record: { padX: 14, padY: 8, row: 26, cellPad: 8, tabGap: 16, ruler: 16, gutterPad: 8 },
  /** How far a mark's highlight reaches past its text. */
  mark: { linesPad: 5 },
  dot: 16,
  ring: 20,
  /** Between a start or end dot and its label. */
  terminalGap: 8,
  bar: 10,
} as const;

/** Boundary title tabs. */
export const tab = { height: 20, pad: 8 };

/** Sequence fragment tabs: the operator at the top-left, with a slanted corner. */
export const fragment = { padX: 8, slant: 6, tabHeight: 19, textY: 10 };

/** Fonts that several steps use. */
export function fontsOf(m: Metrics) {
  return {
    tab: { family: m.sans, size: m.tabSize, weight: m.labelWeight },
    frameTitle: { family: m.sans, size: m.smallSize, weight: m.edgeWeight },
    ruler: { family: m.sans, size: m.tabSize, weight: m.textWeight },
  };
}

/** Vertical radius of a cylinder's elliptical cap. */
export function cylinderCap(width: number): number {
  return Math.min(12, Math.max(6, width * 0.07));
}
