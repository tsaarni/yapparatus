/**
 * The compiled drawing: what the compiler produces and the renderer draws.
 */
import type { Rect, Vec } from "./geometry.ts";
import type { Diagnostic, Role, Shape } from "./scene.ts";

/**
 * Categories a figure can color. Beyond four, readers with red-green color blindness can no
 * longer tell every pair apart, and everyone else must keep matching colors to the legend.
 */
export const maxCategories = 4;

/** A category in a figure's legend: its words, its color slot, and the parts that have it. */
export interface LegendEntry {
  name: string;
  /** For steps: `<Step focus="new">` focuses every part in the category "New". */
  id: string;
  /** 1 to maxCategories: which category color it has. */
  slot: number;
  parts: string[];
}

export interface TextLine {
  text: string;
  x: number;
  y: number;
  size: number;
  weight: number;
  mono: boolean;
  muted: boolean;
  align: "middle" | "start";
}

export interface CompiledNode {
  id: string;
  explicitId: boolean;
  shape: Shape;
  role: Role;
  /** The category color slot, when the part has a category. */
  category?: number;
  label: string;
  rect: Rect;
  lines: TextLine[];
  passive: boolean;
  /** Shown only while a step focuses it. */
  stepOnly: boolean;
  /** A decoration's edge: steps show and fade it with that edge. */
  follows?: string;
  /** Record: y of the line under the title. */
  divider?: number;
  /** Record: hairlines between the ruler, the row offsets, and the cells. */
  rules?: Array<[Vec, Vec]>;
  /** A member: the record or text it belongs to. */
  parent?: string;
  /** A member's numbered badge, which a remark elsewhere refers to. */
  pin?: number;
  /** Start and end: the label beside the dot, outside its layout bounds. */
  labelRect?: Rect;
}

export interface CompiledFrame {
  id: string;
  rect: Rect;
  /** The operator, such as "loop", in a tab at the top-left corner. */
  tab?: { rect: Rect; line: TextLine };
  title?: TextLine;
  dividers: Array<{ y: number; label?: TextLine }>;
}

export interface CompiledLabel {
  text: string;
  rect: Rect;
  center: Vec;
  size: number;
  weight: number;
}

export interface CompiledEdge {
  id: string;
  explicitId: boolean;
  role: Role;
  /** The category color slot, when the part has a category. */
  category?: number;
  dashed: boolean;
  head: "filled" | "open";
  radius: number;
  passive: boolean;
  /** Shown only while a step focuses it. */
  stepOnly: boolean;
  points: Vec[];
  heads: Vec[][];
  labels: CompiledLabel[];
  ariaLabel: string;
}

export interface CompiledEnclosure {
  id: string;
  explicitId: boolean;
  role: Role;
  /** The category color slot, when the part has a category. */
  category?: number;
  rect: Rect;
  title?: TextLine;
  /** Painted area of the title tab, for collision checks. */
  titleRect?: Rect;
}

export interface CompiledDiagram {
  ok: boolean;
  viewBox: Rect;
  nodes: CompiledNode[];
  edges: CompiledEdge[];
  enclosures: CompiledEnclosure[];
  frames: CompiledFrame[];
  /** The categories, in color order. A legend under the drawing explains them. */
  legend: LegendEntry[];
  diagnostics: Diagnostic[];
  /** What a step focuses along with each container: enclosures, rows, columns, sequences. */
  groups: Record<string, string[]>;
}
