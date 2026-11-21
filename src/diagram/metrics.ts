/**
 * Measurements the compiler and the renderer share: fonts, metrics, and shape sizes.
 */

/** A font as the measurer sees it: CSS family, size in units, and weight. */
export interface FontSpec {
  family: string;
  size: number;
  weight: number;
}

/** Text width, injected: the server measures with the font files, tests use a fixed advance. */
export type Measure = (text: string, font: FontSpec) => number;

/** The icons a diagram may draw: each one's markup on the icon grid, and every name. */
export interface IconSet {
  /** The markup of a known icon, from the package; undefined for any other name. */
  body: (name: string) => string | undefined;
  names: readonly string[];
}

/** What the compiler looks up outside itself: text widths, and the icons it may draw. */
export interface Lookups {
  measure: Measure;
  icons: IconSet;
}

/** The size of the square grid that icons are drawn on, as in their `viewBox`. */
export const iconGrid = 24;

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
  /** Where the text of boxes, cylinders, queues, docs, ios, decisions, and actors wraps. */
  wrapWidth: number;
  /** Where notes, free text, and the labels of start and end dots wrap. */
  textWrapWidth: number;
  minWidth: number;
  minHeight: number;
  headLength: number;
  headWidth: number;
  margin: number;
}

/** The fonts and sizes every diagram is compiled with. */
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
  wrapWidth: 220,
  textWrapWidth: 320,
  minWidth: 104,
  minHeight: 46,
  headLength: 10,
  headWidth: 8,
  margin: 14,
};

/** Shape-specific measurements shared by sizing, layout, and anchors. */
export const shapes = {
  actor: { figure: 30, gap: 6 },
  /** An icon shape: the icon above its label, as an actor's figure. */
  icon: { size: 30, gap: 6 },
  /** An icon left of a box's label, and the gap between them. */
  labelIcon: { size: 18, gap: 8 },
  note: { padX: 12, padY: 9, fold: 10 },
  /** How far an input or output's top edge is shifted right of its bottom edge. */
  io: { slant: 14 },
  /** How far a document's wavy bottom rises above and dips below its bottom line. */
  doc: { wave: 5 },
  /** How far each box or page of a stack of replicas sits up and to the right of the one before. */
  stack: { offset: 5 },
  record: { padX: 14, padY: 8, row: 26, cellPad: 8, tabGap: 16, ruler: 16, gutterPad: 8 },
  /** How far a mark's highlight reaches past its text. */
  mark: { linesPad: 5 },
  dot: 16,
  ring: 20,
  /** Between a start or end dot and its label. */
  terminalGap: 8,
  bar: 10,
} as const;

/** Space between neighbors when an author sets none: across (`x`) and down (`y`). */
export const defaultGap = { x: 88, y: 64 };

/**
 * Trees: the default space between siblings and between levels, and in an indented tree how far
 * each level is indented and how far right of its parent's left edge the trunk drops.
 */
export const treeSpacing = { gap: 24, levelGap: 48, indent: 32, trunk: 12 };

/** Inner width of a figure in the wide track: text column plus breakout. */
export const readingWidth = 960;

/** Drawings shrink to this fraction of their natural size before the figure scrolls. */
export const minScale = 0.75;

/** Boundary title tabs. */
export const tab = { height: 20, pad: 8 };

/**
 * Sequence fragments: the tab with the operator at the top-left, with a slanted corner, and the
 * margin a frame keeps around the ink of its members.
 */
export const fragment = { padX: 8, slant: 6, tabHeight: 19, textY: 10, margin: 8 };

/** Fonts that several steps use. */
export function fontsOf(m: Metrics) {
  return {
    tab: { family: m.sans, size: m.tabSize, weight: m.labelWeight },
    frameTitle: { family: m.sans, size: m.smallSize, weight: m.edgeWeight },
    ruler: { family: m.sans, size: m.tabSize, weight: m.textWeight },
  };
}

/** The short radius of a cylinder's elliptical cap, from its width; a queue's from its height. */
export function cylinderCap(width: number): number {
  return Math.min(12, Math.max(6, width * 0.07));
}

/** Shape corners, by kind. */
export const corner = { shape: 6, group: 10, frame: 4, mark: 3 };

/** The warning badge on an element's corner. */
export const badge = { radius: 7 };
