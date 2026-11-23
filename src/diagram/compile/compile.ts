/**
 * Compilation: icons → measure → size → place → route → label → validate → bounds. Each step
 * has its own file; this file runs them in order, each with what the steps before it made.
 */
import { type DiagnosticCode, diagnosticCodes } from "../../document/diagnostic.ts";
import { categoryCount, tooManyCategories } from "../../figure/categories.ts";
import type { Measure } from "../../figure/font.ts";
import {
  type CompiledDiagram,
  type CompiledEdge,
  type CompiledEnclosure,
  type CompiledFrame,
  type CompiledNode,
  headsOf,
  type LegendEntry,
} from "../drawing.ts";
import { type Diagnostic, type Edge, slug } from "../elements.ts";
import { inflate, type Rect, rounded, union, type Vec } from "../geometry.ts";
import { defaultMetrics, type Lookups, type Metrics } from "../metrics.ts";
import type { Scene } from "../scene.ts";
import { checkIds, checkOverlaps, checkPlaced, groupsOf, validate } from "./checks.ts";
import { createEdges } from "./edges.ts";
import { createIcons } from "./icons.ts";
import { CycleError, createLayout } from "./layout.ts";
import { createNodes } from "./nodes.ts";
import { createText, type Report } from "./text.ts";

/** Measure and lay out a built scene into the drawing the views render, with its diagnostics. */
export function compile(
  scene: Scene,
  lookups: Lookups,
  metrics: Metrics = defaultMetrics,
): CompiledDiagram {
  const m = metrics;
  const measure: Measure = (text, font) => lookups.measure(text.replace(/ {2,}/g, " "), font);
  const diagnostics: Diagnostic[] = [];
  const report = (code: DiagnosticCode, message: string, ids: string[], subject?: string) =>
    diagnostics.push({ code, message, ids, ...(subject !== undefined ? { subject } : {}) });
  const categoryOf = (name: string | undefined) => {
    const index = name === undefined ? -1 : scene.categories.indexOf(name);
    return index >= 0 && index < categoryCount ? { category: index + 1 } : {};
  };

  checkIds(scene, report);
  diagnostics.unshift(...scene.diagnostics());
  checkPlaced(scene, report);

  const icons = createIcons(lookups.icons, scene.nodes, report);
  const text = createText(m, measure, report, icons);
  const layout = createLayout(scene, m, measure, report, text, (edge) => inkOf(routeOf(edge)));
  const { compileNode, compileFrame, compileEnclosure } = createNodes(
    m,
    measure,
    text,
    layout,
    categoryOf,
    icons,
  );
  const { compileEdge } = createEdges(m, measure, report, layout, categoryOf);
  const routed = new Map<Edge, ReturnType<typeof compileEdge>>();
  const routeOf = (edge: Edge) => {
    const known = routed.get(edge);
    if (known) return known;
    const made = layout.guard(`route(${edge.id})`, () => compileEdge(edge));
    routed.set(edge, made);
    return made;
  };

  let nodes: CompiledNode[] = [];
  let enclosures: CompiledEnclosure[] = [];
  let edges: CompiledEdge[] = [];
  let frames: CompiledFrame[] = [];
  let routes: Vec[][] = [];
  try {
    nodes = paintOrder(scene.nodes.map((node) => compileNode(node, layout.bounds(node))));
    for (const s of scene.grids) layout.bounds(s);
    enclosures = scene.enclosures.map(compileEnclosure);
    const compiledEdges = scene.edges.map(routeOf);
    edges = compiledEdges.map((e) => e.compiled);
    routes = compiledEdges.map((e) => e.route);
    frames = scene.frames.map(compileFrame);
  } catch (error) {
    if (error instanceof CycleError) {
      report(
        "PLACEMENT_CYCLE",
        `${error.chain.join(" → ")}. These placements depend on each other; anchor one of them independently.`,
        [...new Set(error.chain.map((k) => k.replace(/^\w+\((.*)\)$/, "$1")))],
      );
    } else {
      report("DIAGRAM_FAILED", error instanceof Error ? error.message : String(error), []);
    }
    return finish(false);
  }

  function finish(ok: boolean): CompiledDiagram {
    const groups = groupsOf(scene);
    const { legend, categoryGroups } = legendOf(
      scene,
      [...nodes, ...edges, ...enclosures, ...frames],
      groups,
      report,
    );
    const painted = union([
      ...nodes.flatMap((n) => (n.labelRect ? [n.rect, n.labelRect] : [n.rect])),
      ...enclosures.flatMap((e) => (e.titleRect ? [e.rect, e.titleRect] : [e.rect])),
      ...frames.map((f) => f.rect),
      ...edges.flatMap((e) => [
        ...e.labels.map((l) => l.rect),
        ...[...e.points, ...headsOf(e).flatMap((h) => h.points)].map((p) => ({
          ...p,
          width: 0,
          height: 0,
        })),
      ]),
    ]) ?? { x: 0, y: 0, width: 0, height: 0 };
    const viewBox = inflate(painted, m.margin);
    return {
      ok: ok && !diagnostics.some((d) => diagnosticCodes[d.code].severity === "error"),
      viewBox: {
        x: Math.floor(viewBox.x),
        y: Math.floor(viewBox.y),
        width: Math.ceil(viewBox.width),
        height: Math.ceil(viewBox.height),
      },
      nodes: rounded(nodes),
      edges: rounded(edges),
      enclosures: rounded(enclosures),
      frames: rounded(frames),
      legend,
      diagnostics,
      groups: { ...groups, ...categoryGroups },
      icons: icons.table(),
    };
  }

  validate(scene, nodes, edges, enclosures, frames, report);
  checkOverlaps(edges, routes, report);
  return finish(true);
}

/** What a compiled edge paints: its points, its heads, and its labels. */
function inkOf({ compiled }: { compiled: CompiledEdge }): Rect[] {
  const point = (p: Vec): Rect => ({ ...p, width: 0, height: 0 });
  return [
    ...[...compiled.points, ...headsOf(compiled).flatMap((h) => h.points)].map(point),
    ...compiled.labels.map((l) => l.rect),
  ];
}

/** Nodes in paint order: passive decorations first, then the rest, each in creation order. */
function paintOrder(nodes: CompiledNode[]): CompiledNode[] {
  return [...nodes.filter((n) => n.passive), ...nodes.filter((n) => !n.passive)];
}

/**
 * The legend, in color order, and the elements of each category. A category's id stands for its
 * elements in steps, unless an element or container has that id.
 */
function legendOf(
  scene: Scene,
  elements: Array<{ id: string; category?: number }>,
  groups: Record<string, string[]>,
  report: Report,
): { legend: LegendEntry[]; categoryGroups: Record<string, string[]> } {
  const legend = scene.categories.slice(0, categoryCount).map((name, i) => ({
    name,
    id: slug(name),
    slot: i + 1,
    elements: elements.filter((p) => p.category === i + 1).map((p) => p.id),
  }));
  const taken = new Set([
    ...elements.map((p) => p.id),
    ...scene.grids.map((s) => s.id),
    ...Object.keys(groups),
  ]);
  const categoryGroups: Record<string, string[]> = {};
  for (const entry of legend) {
    if (taken.has(entry.id))
      report(
        "DUPLICATE_ID",
        `The category "${entry.name}" has the id "${entry.id}", which an element already has, so steps cannot focus the category. Rename the category or the element.`,
        [entry.id],
      );
    else categoryGroups[entry.id] = entry.elements;
  }
  if (scene.categories.length > categoryCount)
    report(
      "TOO_MANY_CATEGORIES",
      tooManyCategories(scene.categories, "Merge categories, or split the figure."),
      [],
    );
  return { legend, categoryGroups };
}
