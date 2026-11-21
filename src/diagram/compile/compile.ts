/**
 * Compilation: measure → size → place → route → label → validate → bounds. Each step has
 * its own file; this file runs them in order, each with what the steps before it made.
 */
import { type DiagnosticCode, diagnosticCodes } from "../../document/diagnostic.ts";
import type { DiagramBuilder } from "../builder.ts";
import {
  type CompiledDiagram,
  type CompiledEdge,
  type CompiledEnclosure,
  type CompiledFrame,
  type CompiledNode,
  type LegendEntry,
  maxCategories,
} from "../drawing.ts";
import { type Diagnostic, Edge, type Element, Frame, slug } from "../elements.ts";
import { inflate, type Rect, rounded, union, type Vec } from "../geometry.ts";
import { defaultMetrics, type Measure, type Metrics } from "../metrics.ts";
import { checkIds, checkOverlaps, checkPlaced, groupsOf, validate } from "./checks.ts";
import { createEdges } from "./edges.ts";
import { CycleError, createLayout } from "./layout.ts";
import { createNodes } from "./nodes.ts";
import { createText, type Report } from "./text.ts";

/** Measure and lay out a built scene into the drawing the views render, with its diagnostics. */
export function compile(
  scene: DiagramBuilder,
  measureText: Measure,
  metrics: Metrics = defaultMetrics,
): CompiledDiagram {
  const m = metrics;
  const measure: Measure = (text, font) => measureText(text.replace(/ {2,}/g, " "), font);
  const diagnostics: Diagnostic[] = [...scene.diagnostics];
  const report = (code: DiagnosticCode, message: string, ids: string[]) =>
    diagnostics.push({ code, message, ids });
  const categoryOf = (name: string | undefined) => {
    const index = name === undefined ? -1 : scene.categories.indexOf(name);
    return index >= 0 && index < maxCategories ? { category: index + 1 } : {};
  };

  checkIds(scene, report);
  checkPlaced(scene, report);

  const text = createText(m, measure, report);
  const layout = createLayout(scene, m, measure, report, text);
  const { compileNode, compileFrame, compileEnclosure } = createNodes(
    m,
    measure,
    text,
    layout,
    categoryOf,
  );
  const { compileEdge } = createEdges(m, measure, report, layout, categoryOf);

  let nodes: CompiledNode[] = [];
  let enclosures: CompiledEnclosure[] = [];
  let edges: CompiledEdge[] = [];
  let frames: CompiledFrame[] = [];
  let routes: Vec[][] = [];
  try {
    nodes = paintOrder(scene.nodes.map((node) => compileNode(node, layout.bounds(node))));
    for (const s of scene.stacks) layout.bounds(s);
    enclosures = scene.enclosures.map(compileEnclosure);
    const compiledEdges = scene.edges.map(compileEdge);
    edges = compiledEdges.map((e) => e.compiled);
    routes = compiledEdges.map((e) => e.route);
    frames = compileFrames(scene, nodes, edges, compileFrame, layout.bounds);
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
      [...nodes, ...edges, ...enclosures],
      groups,
      report,
    );
    const painted = union([
      ...nodes.flatMap((n) => (n.labelRect ? [n.rect, n.labelRect] : [n.rect])),
      ...enclosures.flatMap((e) => (e.titleRect ? [e.rect, e.titleRect] : [e.rect])),
      ...frames.map((f) => f.rect),
      ...edges.flatMap((e) => [
        ...e.labels.map((l) => l.rect),
        ...[...e.points, ...e.heads.flat()].map((p) => ({ ...p, width: 0, height: 0 })),
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
    };
  }

  validate(scene, nodes, edges, enclosures, report);
  checkOverlaps(edges, routes, report);
  return finish(true);
}

/**
 * Compile the frames, each after the frames it holds, so that a frame covers the ink of its
 * members: edge points, heads, and labels, node rectangles and labels, and inner frames.
 */
function compileFrames(
  scene: DiagramBuilder,
  nodes: CompiledNode[],
  edges: CompiledEdge[],
  compileFrame: (frame: Frame, ink: Rect[]) => CompiledFrame,
  bounds: (el: Element) => Rect,
): CompiledFrame[] {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const edgeOf = new Map(scene.edges.map((e, i) => [e, edges[i]]));
  const done = new Map<Frame, CompiledFrame>();
  const point = (p: Vec): Rect => ({ ...p, width: 0, height: 0 });
  const inkOf = (member: Element | Edge | Frame): Rect[] => {
    if (member instanceof Frame) return [frameOf(member).rect];
    if (member instanceof Edge) {
      const e = edgeOf.get(member);
      return e
        ? [...[...e.points, ...e.heads.flat()].map(point), ...e.labels.map((l) => l.rect)]
        : [];
    }
    const n = nodeById.get(member.id);
    if (!n) return [bounds(member)];
    return n.labelRect ? [n.rect, n.labelRect] : [n.rect];
  };
  const frameOf = (frame: Frame): CompiledFrame => {
    const known = done.get(frame);
    if (known) return known;
    const compiled = compileFrame(frame, (scene.groups.get(frame) ?? []).flatMap(inkOf));
    done.set(frame, compiled);
    return compiled;
  };
  return scene.frames.map(frameOf);
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
  scene: DiagramBuilder,
  elements: Array<{ id: string; category?: number }>,
  groups: Record<string, string[]>,
  report: Report,
): { legend: LegendEntry[]; categoryGroups: Record<string, string[]> } {
  const legend = scene.categories.slice(0, maxCategories).map((name, i) => ({
    name,
    id: slug(name),
    slot: i + 1,
    elements: elements.filter((p) => p.category === i + 1).map((p) => p.id),
  }));
  const taken = new Set([
    ...elements.map((p) => p.id),
    ...scene.stacks.map((s) => s.id),
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
  if (scene.categories.length > maxCategories)
    report(
      "TOO_MANY_CATEGORIES",
      `This figure has ${scene.categories.length} categories; ${maxCategories} can be told apart by color. Elements in ${scene.categories
        .slice(maxCategories)
        .map((c) => `"${c}"`)
        .join(", ")} are drawn without a color. Merge categories, or split the figure.`,
      [],
    );
  return { legend, categoryGroups };
}
