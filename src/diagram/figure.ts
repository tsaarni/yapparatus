/**
 * A figure: its draw program, its steps, and `build`, compiled and checked together. The page
 * compiler runs it in Node with the reader's font files; tests run it with a fixed measure.
 */
import type { DiagnosticCode } from "../protocol.ts";
import { compile } from "./compile.ts";
import { type CompiledDiagram, expand } from "./compiled.ts";
import { overlap } from "./geometry.ts";
import { type Measure, minScale, readingWidth } from "./metrics.ts";
import { type Diagnostic, DiagramBuilder } from "./scene.ts";

/** A step as data: its id and the ids it focuses, as written. */
export interface FigureStep {
  id?: string;
  focus: string[];
}

/** What a figure is made of. */
export interface Figure {
  /** Builds the scene: create elements, arrange them, connect them. */
  draw: (d: DiagramBuilder) => void;
  steps: FigureStep[];
  /** Hide each part until the first step that focuses it. */
  build: boolean;
}

/**
 * Runs `draw`, compiles the scene, and checks the steps and the width. The result has every
 * diagnostic. `ok` is false when the drawing cannot be shown; step and width problems leave
 * it as the compiler set it.
 */
export function compileFigure(figure: Figure, measure: Measure): CompiledDiagram {
  const diagram = compileDraw(figure.draw, measure);
  if (!diagram.ok) return diagram;
  return {
    ...diagram,
    diagnostics: [
      ...diagram.diagnostics,
      ...checkWidth(diagram),
      ...checkSteps(figure.steps, diagram, figure.build),
    ],
  };
}

/** A drawing with nothing to show: the draw program could not run. */
export function drawFailed(message: string): CompiledDiagram {
  return {
    ok: false,
    viewBox: { x: 0, y: 0, width: 0, height: 0 },
    nodes: [],
    edges: [],
    enclosures: [],
    frames: [],
    legend: [],
    groups: {},
    diagnostics: [{ code: "DRAW_FAILED", message, ids: [] }],
  };
}

function compileDraw(draw: Figure["draw"], measure: Measure): CompiledDiagram {
  const scene = new DiagramBuilder();
  try {
    draw(scene);
  } catch (error) {
    return drawFailed(error instanceof Error ? error.message : String(error));
  }
  return compile(scene, measure);
}

/** Checked against a fixed budget, not the current window, so every author sees the same result. */
function checkWidth(diagram: CompiledDiagram): Diagnostic[] {
  const natural = diagram.viewBox.width;
  if (natural * minScale <= readingWidth) return [];
  return [
    {
      code: "DIAGRAM_SCROLLS",
      message: `The drawing is ${natural} units wide. The widest figure area fits ${readingWidth} at full size and ${Math.floor(readingWidth / minScale)} when shrunk, so readers must scroll sideways. Stack rows into columns or shorten labels.`,
      ids: [],
    },
  ];
}

function checkSteps(
  figureSteps: FigureStep[],
  diagram: CompiledDiagram,
  build: boolean,
): Diagnostic[] {
  const steps = figureSteps.map((step) => ({ ...step, parts: expand(step.focus, diagram.groups) }));
  const parts = [
    ...diagram.nodes.filter((n) => !n.passive).map((n) => n.id),
    ...diagram.edges.filter((e) => !e.passive).map((e) => e.id),
    ...diagram.enclosures.map((e) => e.id),
    ...diagram.frames.map((f) => f.id),
  ];
  const known = new Set([...parts, ...Object.keys(diagram.groups)]);
  const diagnostic = (
    code: DiagnosticCode,
    message: string,
    ids: string[] = [],
    subject?: string,
  ): Diagnostic => ({ code, message, ids, ...(subject ? { subject } : {}) });
  const diagnostics: Diagnostic[] = steps.flatMap((step, i) =>
    step.focus
      .filter((part) => !known.has(part))
      .map((part) =>
        diagnostic(
          "UNKNOWN_PART",
          `Step ${i + 1} focuses "${part}", which is not a part of this diagram. Parts: ${parts.join(", ")}.`,
          [],
          part,
        ),
      ),
  );
  const ids = new Set<string>();
  for (const step of steps) {
    if (!step.id) continue;
    if (known.has(step.id) || ids.has(step.id))
      diagnostics.push(
        diagnostic(
          "DUPLICATE_ID",
          `Step id "${step.id}" is already used in this figure.`,
          [],
          step.id,
        ),
      );
    ids.add(step.id);
  }
  // Step-only parts: each must appear somewhere, and those shown together must not collide.
  const stepOnly = diagram.nodes.filter((n) => n.stepOnly);
  for (const part of [...stepOnly, ...diagram.edges.filter((e) => e.stepOnly)])
    if (!steps.some((step) => step.parts.has(part.id)))
      diagnostics.push(
        diagnostic("STEP_ONLY_UNUSED", `${part.id} is stepOnly, but no step focuses it.`, [
          part.id,
        ]),
      );
  steps.forEach((step, i) => {
    const together = stepOnly.filter((n) => step.parts.has(n.id));
    for (let a = 0; a < together.length; a++)
      for (let b = a + 1; b < together.length; b++) {
        const [x, y] = [together[a], together[b]];
        if (x && y && overlap(x.rect, y.rect))
          diagnostics.push(
            diagnostic(
              "NODE_OVERLAP",
              `${x.id} and ${y.id} overlap, and step ${i + 1} shows both.`,
              [x.id, y.id],
            ),
          );
      }
  });
  if (build && !steps.length)
    diagnostics.push(
      diagnostic(
        "BUILD_WITHOUT_STEPS",
        "build reveals parts step by step, but the diagram has no <Step> children.",
      ),
    );
  return diagnostics;
}
