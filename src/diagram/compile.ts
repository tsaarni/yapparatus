/**
 * Compilation: measure → size → place → route → label → validate → bounds. Each step has
 * its own file; this file runs them in order, each with what the steps before it made.
 */
import { type DiagnosticCode, diagnosticCodes } from "../protocol.ts";
import {
  type CompiledDiagram,
  type CompiledEdge,
  type CompiledEnclosure,
  type CompiledFrame,
  type CompiledNode,
  type LegendEntry,
  maxCategories,
} from "./compiled.ts";
import { createEdges } from "./edges.ts";
import { inflate, union } from "./geometry.ts";
import { CycleError, createLayout } from "./layout.ts";
import { defaultMetrics, type Measure, type Metrics } from "./metrics.ts";
import { createNodes } from "./nodes.ts";
import { type Diagnostic, type DiagramBuilder, slug } from "./scene.ts";
import { createText, type Report } from "./text.ts";
import { checkIds, checkPlaced, groupsOf, validate } from "./validate.ts";

export function compile(
  scene: DiagramBuilder,
  measure: Measure,
  metrics: Metrics = defaultMetrics,
): CompiledDiagram {
  const m = metrics;
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
  try {
    nodes = scene.nodes.map((node) => compileNode(node, layout.bounds(node)));
    for (const s of scene.stacks) layout.bounds(s);
    enclosures = scene.enclosures.map(compileEnclosure);
    edges = scene.edges.map(compileEdge);
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
      nodes,
      edges,
      enclosures,
      frames,
      legend,
      diagnostics,
      groups: { ...groups, ...categoryGroups },
    };
  }

  validate(scene, nodes, edges, enclosures, report);
  return finish(true);
}

/**
 * The legend, in color order, and the parts of each category. A category's id stands for its
 * parts in steps, unless a part or container has that id.
 */
function legendOf(
  scene: DiagramBuilder,
  parts: Array<{ id: string; category?: number }>,
  groups: Record<string, string[]>,
  report: Report,
): { legend: LegendEntry[]; categoryGroups: Record<string, string[]> } {
  const legend = scene.categories.slice(0, maxCategories).map((name, i) => ({
    name,
    id: slug(name),
    slot: i + 1,
    parts: parts.filter((p) => p.category === i + 1).map((p) => p.id),
  }));
  const taken = new Set([
    ...parts.map((p) => p.id),
    ...scene.stacks.map((s) => s.id),
    ...Object.keys(groups),
  ]);
  const categoryGroups: Record<string, string[]> = {};
  for (const entry of legend) {
    if (taken.has(entry.id))
      report(
        "DUPLICATE_ID",
        `The category "${entry.name}" has the id "${entry.id}", which a part already has, so steps cannot focus the category. Rename the category or the part.`,
        [entry.id],
      );
    else categoryGroups[entry.id] = entry.parts;
  }
  if (scene.categories.length > maxCategories)
    report(
      "TOO_MANY_CATEGORIES",
      `This figure has ${scene.categories.length} categories; ${maxCategories} can be told apart by color. Parts in ${scene.categories
        .slice(maxCategories)
        .map((c) => `"${c}"`)
        .join(", ")} are drawn without a color. Merge categories, or split the figure.`,
      [],
    );
  return { legend, categoryGroups };
}
