/**
 * `<Diagram>` drawings, compiled when the page is compiled. Each diagram's `draw` program runs
 * here, in the server process, and the drawing is measured with the web app's font files and
 * checked with its steps. The drawing replaces `draw` as the `drawing` prop, so the browser
 * only draws it, and its problems are compile diagnostics of the page.
 */
import vm from "node:vm";
import type { Root } from "hast";
import type {
  MdxJsxAttribute,
  MdxJsxFlowElementHast,
  MdxJsxTextElementHast,
} from "mdast-util-mdx-jsx";
import { visit } from "unist-util-visit";
import type { CompiledDiagram } from "./diagram/compiled.ts";
import { compileFigure, drawFailed, type FigureStep } from "./diagram/figure.ts";
import type { DiagramBuilder } from "./diagram/scene.ts";
import { fontMeasure } from "./font-measure.ts";
import { type ContentIssue, compiledAttribute, contentIssues } from "./markdown-plugin.ts";

type Jsx = MdxJsxFlowElementHast | MdxJsxTextElementHast;

/** A drawing, and the line of `draw` that threw, counted from 1 at the line `draw` starts on. */
interface Compiled {
  drawing: CompiledDiagram;
  drawLine?: number;
}

/** The file name that stack frames give the code of a draw program. */
const drawFile = "yapparatus:draw";

/**
 * Drawings by their draw program, steps, and build. An edit elsewhere on the page compiles
 * the page again, and its unchanged diagrams are not compiled again.
 */
const cache = new Map<string, Compiled>();
const cacheSize = 500;

/**
 * The figures of each compiled file, by absolute path: the text the file was compiled from,
 * each diagram with an id, and the ids of its charts. The server draws a diagram's picture
 * from here, and compiles the file again when its text on disk is newer.
 */
export const pageFigures = new Map<
  string,
  { source: string; diagrams: Map<string, CompiledDiagram>; charts: Set<string> }
>();

export function diagrams() {
  return (tree: Root, file: { path: string; value: unknown }) => {
    const issues = contentIssues.get(file.path) ?? [];
    contentIssues.set(file.path, issues);
    const figures = {
      source: String(file.value),
      diagrams: new Map<string, CompiledDiagram>(),
      charts: new Set<string>(),
    };
    visit(tree, (node) => {
      if (node.type !== "mdxJsxFlowElement" && node.type !== "mdxJsxTextElement") return;
      const jsx = node as Jsx;
      const id = attribute(jsx, "id")?.value;
      if (jsx.name === "Diagram") {
        const figure = diagram(jsx, issues);
        if (typeof id === "string") figures.diagrams.set(id, figure);
      }
      if (jsx.name === "Chart" && typeof id === "string") figures.charts.add(id);
    });
    pageFigures.set(file.path, figures);
  };
}

function diagram(jsx: Jsx, issues: ContentIssue[]): CompiledDiagram {
  const line = jsx.position?.start.line ?? 0;
  const id = attribute(jsx, "id")?.value;
  const target = typeof id === "string" ? id : undefined;
  // A figure with an id is found by it, and the server reads its lines from the page as it is now.
  const report = (issue: Omit<ContentIssue, "line" | "target">, at?: number) =>
    issues.push({
      ...issue,
      ...(target ? { target } : {}),
      ...(at ? { line: at } : target ? {} : { line }),
    });
  const steps = readSteps(jsx, (subject, message, at) =>
    report({ code: "STEP_NOT_TEXT", subject, message }, at),
  );
  const build = isBuild(jsx);
  const draw = attribute(jsx, "draw");
  const expression = typeof draw?.value === "object" ? draw.value : undefined;
  const start = expression?.data?.estree?.body[0];
  const result: Compiled =
    expression && start?.type === "ExpressionStatement"
      ? compileDiagram(expression.value, steps, build)
      : {
          drawing: drawFailed(
            "<Diagram> needs draw={(d) => { … }}: a function that builds the drawing.",
          ),
        };
  // The source text of `draw` starts on the line of its opening brace.
  const first =
    start?.type === "ExpressionStatement" && expression
      ? (start.expression.loc?.start.line ?? line) - leadingLines(expression.value)
      : line;
  for (const d of result.drawing.diagnostics) {
    const subject = d.subject ?? (d.ids.length ? d.ids.join(",") : undefined);
    report(
      {
        code: d.code,
        message: d.message,
        ...(subject ? { subject } : {}),
        ...(d.ids.length ? { elements: d.ids } : {}),
      },
      d.code === "DRAW_FAILED" && result.drawLine ? first + result.drawLine - 1 : undefined,
    );
  }
  jsx.attributes = jsx.attributes.filter(
    (a) => !(a.type === "mdxJsxAttribute" && (a.name === "draw" || a.name === "drawing")),
  );
  jsx.attributes.push(compiledAttribute("drawing", result.drawing));
  return result.drawing;
}

function attribute(jsx: Jsx, name: string): MdxJsxAttribute | undefined {
  const found = jsx.attributes.find((a) => a.type === "mdxJsxAttribute" && a.name === name);
  return found?.type === "mdxJsxAttribute" ? found : undefined;
}

/** `build`, `build={true}`, or `build={false}`. */
function isBuild(jsx: Jsx): boolean {
  const build = attribute(jsx, "build");
  if (!build) return false;
  if (typeof build.value !== "object" || !build.value) return true;
  const statement = build.value.data?.estree?.body[0];
  return !(
    statement?.type === "ExpressionStatement" &&
    statement.expression.type === "Literal" &&
    statement.expression.value === false
  );
}

/** Lines before the first character of an expression's source text. */
function leadingLines(source: string): number {
  return (/^\s*/.exec(source)?.[0] ?? "").split("\n").length - 1;
}

/**
 * The `<Step>` children's ids and focus, as written. Both are plain text, which the compiler
 * reads here: a computed value is reported, and the step checks skip it.
 */
function readSteps(
  jsx: Jsx,
  report: (subject: string, message: string, line: number) => void,
): FigureStep[] {
  const steps = jsx.children.filter(
    (c): c is Jsx =>
      (c.type === "mdxJsxFlowElement" || c.type === "mdxJsxTextElement") && c.name === "Step",
  );
  return steps.map((step, i) => {
    const text = (name: "id" | "focus"): string | undefined => {
      const value = attribute(step, name)?.value;
      if (typeof value === "string") return value;
      if (!value) return undefined;
      report(
        `step ${i + 1} ${name}`,
        `Step ${i + 1} has ${name}={…}. The compiler checks steps when it compiles the page, so ${name} is plain text, such as ${name === "id" ? 'id="lookup"' : 'focus="client api"'}.`,
        step.position?.start.line ?? jsx.position?.start.line ?? 0,
      );
      return undefined;
    };
    const id = text("id");
    return {
      ...(id ? { id } : {}),
      focus: (text("focus") ?? "").split(/\s+/).filter(Boolean),
    };
  });
}

function compileDiagram(source: string, steps: FigureStep[], build: boolean): Compiled {
  const key = JSON.stringify([source, steps, build]);
  const known = cache.get(key);
  if (known) {
    // The most recently used go last, so the oldest go first.
    cache.delete(key);
    cache.set(key, known);
    return known;
  }
  const compiled = run(source, steps, build);
  cache.set(key, compiled);
  for (const old of cache.keys()) {
    if (cache.size <= cacheSize) break;
    cache.delete(old);
  }
  return compiled;
}

/**
 * Evaluate `draw` in this process and compile the figure. `draw` stands alone: it runs in its
 * own context, which has the standard JavaScript globals and none of Node's, such as `process`.
 * A name it does not define is therefore not defined, and the error says so. The context only
 * keeps out names: it does not protect the server from the code.
 */
function run(source: string, steps: FigureStep[], build: boolean): Compiled {
  let draw: unknown;
  try {
    // On one line, so the lines of `source` keep their numbers.
    draw = vm.runInContext(`"use strict";(${source})`, vm.createContext(), { filename: drawFile });
  } catch (error) {
    return { drawing: drawFailed(explain(error)), ...lineOf(error) };
  }
  if (typeof draw !== "function")
    return { drawing: drawFailed("draw is a function that builds the drawing: (d) => { … }.") };
  let thrown: unknown;
  const { measure, uncovered } = fontMeasure();
  const drawing = compileFigure(
    {
      draw: (d: DiagramBuilder) => {
        try {
          draw(d);
        } catch (error) {
          thrown = error;
          throw new Error(explain(error));
        }
      },
      steps,
      build,
    },
    measure,
  );
  if (uncovered.size) {
    const characters = [...uncovered];
    drawing.diagnostics.push({
      code: "FONT_FALLBACK",
      message: `The text has ${characters.map((c) => `"${c}"`).join(", ")}, which the web app's fonts do not have. A browser draws ${characters.length === 1 ? "it" : "them"} in a system font, so the width is estimated and the text may not fit. Use characters the fonts have, such as "->" for "→".`,
      ids: [],
      subject: characters.join(""),
    });
  }
  return { drawing, ...lineOf(thrown) };
}

/**
 * An error that `draw` threw. Errors made in draw's context are not `instanceof Error` here,
 * so they are recognized by their fields.
 */
function asError(error: unknown): { name: string; message: string; stack?: string } | undefined {
  return typeof error === "object" && error !== null && "message" in error
    ? (error as Error)
    : undefined;
}

/** What went wrong, and for a name that `draw` does not define, why. */
function explain(thrown: unknown): string {
  const error = asError(thrown);
  if (!error) return String(thrown);
  const name = error.name === "ReferenceError" && /^(\S+) is not defined$/.exec(error.message)?.[1];
  if (name)
    return `draw uses ${name}, which it does not define. A draw program uses only its parameter and the values it defines itself: define ${name} inside draw.`;
  return error.message;
}

/** The line of `draw` in the innermost stack frame of its code. */
function lineOf(error: unknown): { drawLine?: number } {
  const stack = asError(error)?.stack ?? "";
  const line = Number(new RegExp(`${drawFile}:(\\d+):\\d+`).exec(stack)?.[1]);
  return line ? { drawLine: line } : {};
}
