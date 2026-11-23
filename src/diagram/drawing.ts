/**
 * The compiled drawing that the compiler produces and the renderer draws. The page embeds it,
 * so coordinates are rounded to hundredths and false flags and default values are left out.
 */

import type { Diagnostic, HeadKind, Role, Shape } from "./elements.ts";
import type { Rect, Vec } from "./geometry.ts";

/** A category in a figure's legend: its words, its color slot, and the elements that have it. */
export interface LegendEntry {
  name: string;
  /** For steps: `<Step focus="new">` focuses every element in the category "New". */
  id: string;
  /** 1 to the category count: which category color it has. */
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
  /** A box's or icon shape's icon: its name in the diagram's `icons`, and where it is drawn. */
  icon?: { name: string; rect: Rect };
}

/** A frame with its rectangle, operator tab, title, and dividers placed. */
export interface CompiledFrame {
  id: string;
  /** Set when the frame has a role. Without one, the frame keeps its own hairline look. */
  role?: Role;
  /** The category color slot, when the element has a category. */
  category?: number;
  /** Shown only while a step focuses it. */
  stepOnly?: true;
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

/** An arrowhead: its kind, and its points, a filled polygon or an open polyline. */
export interface CompiledHead {
  kind: Exclude<HeadKind, "none">;
  points: Vec[];
}

/** An edge with its route as points, its arrowheads, and its labels placed. */
export interface CompiledEdge {
  id: string;
  role: Role;
  /** The category color slot, when the element has a category. */
  category?: number;
  dashed?: true;
  radius: number;
  /** Decoration only, such as a lifeline or an activation bar: never interactive. */
  passive?: true;
  /** Shown only while a step focuses it. */
  stepOnly?: true;
  /** The elements at its ends, when a step that focuses both focuses the edge too. */
  ends?: [string, string];
  points: Vec[];
  /** The arrowhead at the `to` end, when it has one. */
  head?: CompiledHead;
  /** The arrowhead at the `from` end, when it has one. */
  tail?: CompiledHead;
  labels: CompiledLabel[];
  ariaLabel: string;
}

/** The arrowheads an edge has: the one at `to`, then the one at `from`. */
export function headsOf(edge: CompiledEdge): CompiledHead[] {
  return [edge.head, edge.tail].filter((h) => h !== undefined);
}

/** An enclosure with its boundary rectangle and placed title. */
export interface CompiledEnclosure {
  id: string;
  role: Role;
  /** The category color slot, when the element has a category. */
  category?: number;
  /** Shown only while a step focuses it. */
  stepOnly?: true;
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
  /**
   * The markup of each icon the nodes name, once, on the icon grid, in `currentColor`. It comes
   * from the icon package, never from the author.
   */
  icons: Record<string, string>;
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

/** What a step focuses, as one place computes it for the view, the checks, and the links. */
export interface StepFocus {
  /** The ids named, containers and categories expanded, and the edges that follow their ends. */
  elements: Set<string>;
  /** A step without `focus`: it shows the whole figure plain, and focuses nothing. */
  whole: boolean;
}

/**
 * The elements a step focuses. An edge with `ends` is focused when both its ends are. A step
 * without `focus` focuses nothing, so it changes no other step.
 */
export function stepFocus(focus: string[], diagram: CompiledDiagram): StepFocus {
  if (!focus.length) return { elements: new Set(), whole: true };
  const elements = expand(focus, diagram.groups);
  for (const edge of diagram.edges)
    if (edge.ends?.every((end) => elements.has(end))) elements.add(edge.id);
  return { elements, whole: false };
}

/** Each edge that follows its ends, with the elements at them. */
export function edgeEnds(diagram: CompiledDiagram): Map<string, [string, string]> {
  return new Map(diagram.edges.flatMap((e) => (e.ends ? [[e.id, e.ends] as const] : [])));
}

/** How an element looks in a step. "absent" is a step-only element outside its steps. */
export type ElementState = "focus" | "dim" | "hidden" | "absent" | undefined;

/** What decides how each element looks: the steps, the open one, and a legend entry pointed at. */
export interface StepView {
  /** What each step focuses. */
  steps: StepFocus[];
  /** The open step, counted from 0. Undefined shows the whole figure. */
  active: number | undefined;
  /** Hide each element until the first step that focuses it. */
  build: boolean;
  /** Elements shown only while a step focuses them. */
  stepOnly: Set<string>;
  /** The edges that follow their ends: with `build`, hidden while an end is hidden. */
  ends: Map<string, [string, string]>;
  /** The elements of the legend entry the reader points at, which override the step. */
  preview?: string[];
}

/** The elements shown only while a step focuses them. */
export function stepOnlyElements(diagram: CompiledDiagram): Set<string> {
  return new Set([
    ...[...diagram.nodes, ...diagram.edges, ...diagram.enclosures, ...diagram.frames]
      .filter((element) => element.stepOnly)
      .map((element) => element.id),
  ]);
}

/**
 * Focused elements are drawn heavier, the others fade, and with `build` the elements that a later
 * step focuses first are hidden, with the edges that follow them. Step-only ones are absent.
 */
export function elementState(element: string, view: StepView): ElementState {
  const { steps, active, build, stepOnly, ends, preview } = view;
  if (preview)
    return preview.includes(element) ? "focus" : stepOnly.has(element) ? "absent" : "dim";
  const current = active === undefined ? undefined : steps[active];
  if (active === undefined || !current || current.whole)
    return stepOnly.has(element) ? "absent" : undefined;
  if (current.elements.has(element)) return "focus";
  if (stepOnly.has(element)) return "absent";
  const later = (id: string) => {
    const first = steps.findIndex((step) => step.elements.has(id));
    return first > active;
  };
  if (build && (later(element) || ends.get(element)?.some(later))) return "hidden";
  return "dim";
}
