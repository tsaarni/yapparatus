/**
 * The compiled drawing that the compiler produces and the renderer draws. The page embeds it,
 * so coordinates are rounded to hundredths and false flags and default values are left out.
 */

import type { Diagnostic, Role, Shape } from "./elements.ts";
import type { Rect, Vec } from "./geometry.ts";

/**
 * Categories a figure can color. Beyond four, readers with red-green color blindness can no
 * longer tell every pair apart, and everyone else must keep matching colors to the legend.
 */
export const maxCategories = 4;

/** A category in a figure's legend: its words, its color slot, and the elements that have it. */
export interface LegendEntry {
  name: string;
  /** For steps: `<Step focus="new">` focuses every element in the category "New". */
  id: string;
  /** 1 to maxCategories: which category color it has. */
  slot: number;
  elements: string[];
}

/** One placed line of text, centered on x unless `align` says otherwise. */
export interface TextLine {
  text: string;
  x: number;
  y: number;
  size: number;
  weight: number;
  /** Set in the monospace font. */
  mono?: true;
  /** Drawn in the muted text color. */
  muted?: true;
  /** Starts at x. Without it, the line is centered on x. */
  align?: "start";
}

/** A node, record cell, or text mark with its final rectangle and placed lines. */
export interface CompiledNode {
  id: string;
  shape: Shape;
  role: Role;
  /** The category color slot, when the element has a category. */
  category?: number;
  label: string;
  rect: Rect;
  lines: TextLine[];
  /** Decoration only, such as a lifeline or an activation bar: never interactive. */
  passive?: true;
  /** Shown only while a step focuses it. */
  stepOnly?: true;
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
  /** A box or document drawn as a stack of this many, from 2 to 4. */
  replicas?: number;
}

/** A frame with its rectangle, operator tab, title, and dividers placed. */
export interface CompiledFrame {
  id: string;
  rect: Rect;
  /** The operator, such as "loop", in a tab at the top-left corner. */
  tab?: { rect: Rect; line: TextLine };
  title?: TextLine;
  dividers: Array<{ y: number; label?: TextLine }>;
}

/** An edge label: one line for each `\n`, centered in its rectangle. */
export interface CompiledLabel {
  lines: TextLine[];
  /** Covers every line; the overlap checks and the view box use it. */
  rect: Rect;
}

/** An edge with its route as points, its arrowheads as polygons, and its labels placed. */
export interface CompiledEdge {
  id: string;
  role: Role;
  /** The category color slot, when the element has a category. */
  category?: number;
  dashed?: true;
  head: "filled" | "open";
  radius: number;
  /** Decoration only, such as a lifeline or an activation bar: never interactive. */
  passive?: true;
  /** Shown only while a step focuses it. */
  stepOnly?: true;
  points: Vec[];
  heads: Vec[][];
  labels: CompiledLabel[];
  ariaLabel: string;
}

/** An enclosure with its boundary rectangle and placed title. */
export interface CompiledEnclosure {
  id: string;
  role: Role;
  /** The category color slot, when the element has a category. */
  category?: number;
  rect: Rect;
  title?: TextLine;
  /** Painted area of the title tab, for collision checks. */
  titleRect?: Rect;
}

/** A whole compiled diagram; `ok` is false when it failed or any diagnostic is an error. */
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

/** The elements named, with every container replaced by itself plus all it holds. */
export function expand(ids: string[], groups: Record<string, string[]>): Set<string> {
  const elements = new Set<string>();
  const visit = (id: string) => {
    if (elements.has(id)) return;
    elements.add(id);
    for (const member of groups[id] ?? []) visit(member);
  };
  for (const id of ids) visit(id);
  return elements;
}

/** How an element looks in a step. "absent" is a step-only element outside its steps. */
export type ElementState = "focus" | "dim" | "hidden" | "absent" | undefined;

/** What decides how each element looks: the steps, the open one, and a legend entry pointed at. */
export interface StepView {
  /** Each step's focused elements, with containers expanded to their contents. */
  steps: Array<Set<string>>;
  /** The open step, counted from 0. Undefined shows the whole figure. */
  active: number | undefined;
  /** Hide each element until the first step that focuses it. */
  build: boolean;
  /** Elements shown only while a step focuses them. */
  stepOnly: Set<string>;
  /** The elements of the legend entry the reader points at, which override the step. */
  preview?: string[];
}

/** The elements shown only while a step focuses them. */
export function stepOnlyElements(diagram: CompiledDiagram): Set<string> {
  return new Set([
    ...diagram.nodes.filter((n) => n.stepOnly).map((n) => n.id),
    ...diagram.edges.filter((e) => e.stepOnly).map((e) => e.id),
  ]);
}

/**
 * Focused elements are drawn heavier, the others fade, and with `build` the elements that a later
 * step focuses first are hidden. A step-only element is absent outside its steps.
 */
export function elementState(element: string, view: StepView): ElementState {
  const { steps, active, build, stepOnly, preview } = view;
  if (preview)
    return preview.includes(element) ? "focus" : stepOnly.has(element) ? "absent" : "dim";
  const current = active === undefined ? undefined : steps[active];
  if (current?.has(element)) return "focus";
  if (stepOnly.has(element)) return "absent";
  if (!current || active === undefined) return undefined;
  const first = steps.findIndex((step) => step.has(element));
  if (build && first >= 0 && first > active) return "hidden";
  return "dim";
}
