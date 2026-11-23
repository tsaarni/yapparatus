/**
 * `<Chart>` data, read and checked at compile time. A data block or page table becomes the `data`
 * prop; a file, which can be large, is loaded from its own module through the `load` prop.
 */
import * as Plot from "@observablehq/plot";
import { valueToEstree } from "estree-util-value-to-estree";
import type { Element, ElementContent, Root } from "hast";
import { toString as textOf } from "hast-util-to-string";
import { parseHTML } from "linkedom";
import type { MdxJsxFlowElementHast } from "mdast-util-mdx-jsx";
import { visit } from "unist-util-visit";
import { type ChartInput, drawChart } from "../../chart/drawing.ts";
import { type DataFormat, formatNamed, formatNames, formatOfFile } from "../../chart/formats.ts";
import {
  type ChartProblem,
  type ChartSpec,
  type PlotFunction,
  type Row,
  runPlot,
  thrownProblem,
} from "../../chart/spec.ts";
import {
  type ChartData,
  type DataIssue,
  type RawTable,
  rowCount,
  rowObjects,
  typeTable,
} from "../../chart/table.ts";
import type { Measure } from "../../diagram/metrics.ts";
import { diagnosticCodes } from "../../document/diagnostic.ts";
import { type FileAddress, parseFileAddress } from "../../document/file-address.ts";
import { authorFunction, timedOut, withTimeLimit } from "../author-function.ts";
import type { ExternalFiles, SourceFile } from "../external-files.ts";
import { fontExtent, fontMeasure } from "../font-measure.ts";
import { revision } from "../revision.ts";
import { chartPaint, chartType, chartWidth } from "../theme-values.ts";
import { codeLanguageOf, contentIssues } from "./conventions.ts";
import { excerptFiles } from "./excerpts.ts";

/** A JavaScript expression in the syntax tree, as MDX stores a prop's value. */
type Expression = ReturnType<typeof valueToEstree>;

/** The module a file's chart loads its data from: `virtual:yapparatus/data:<directory>/<path>`. */
export const dataModule = "virtual:yapparatus/data:";

/** Data in a format, typed, with its problems, or why it could not be read. */
function readData(
  format: DataFormat,
  text: string,
): { data: ChartData; issues: DataIssue[] } | DataIssue {
  const table = format.read(text);
  return "message" in table ? table : typeTable(table);
}

/** A chart's data file, read and typed. */
export interface ChartFile {
  source: SourceFile;
  data: ChartData;
  /** Problems with the cells, each with its line in the file. */
  issues: DataIssue[];
}

/** Read and type a chart's file, or say why it cannot be read. */
export function readChartFile(
  files: ExternalFiles,
  address: FileAddress,
): ChartFile | { error: string; line?: number; subject?: string } {
  const format = formatOfFile(address.path);
  if (!format) return { error: `${address.path} is not a ${formatNames()} file.` };
  const source = files.read(address);
  if ("error" in source) return source;
  const read = readData(format, source.lines.join("\n"));
  if ("message" in read) return { error: read.message, line: read.line, subject: read.subject };
  return { source, ...read };
}

/** The module id of a chart file's data, which changes with the file's content. */
export function dataModuleId(address: FileAddress, source: SourceFile) {
  const version = revision(source.lines.join("\n")).slice(0, 12);
  return `${dataModule}${address.folder}/${address.path}?v=${version}`;
}

/** A chart file's data as a module: JSON that the browser parses only when the chart loads it. */
export function dataModuleCode(data: ChartData) {
  return `export default JSON.parse(${JSON.stringify(JSON.stringify(data))});`;
}

/** The width of a chart on a phone, where tick labels run into each other first. */
const phoneWidth = 320;

/** The document a chart is drawn in on the server, which has no browser. */
const blankDocument = () =>
  parseHTML("<!doctype html><html><body></body></html>")
    .document as unknown as ChartInput["document"];

/**
 * Draw a chart at the widest reading width and at a phone's width, and return the problems of the
 * first and the overlaps that only the second has, named by its width.
 */
function drawingProblems(spec: ChartSpec, rows: Row[], measure: Measure): ChartProblem[] {
  const font = { ...chartType, ...fontExtent(chartType.family) };
  const draw = (width: number) =>
    drawChart({
      Plot,
      spec,
      rows,
      width,
      document: blankDocument(),
      font,
      measure,
      paint: chartPaint,
      id: "chart",
    }).problems;
  const wide = draw(chartWidth);
  const narrow = draw(phoneWidth).filter(
    (p) =>
      p.code === "CHART_OVERLAP" && !wide.some((w) => w.code === p.code && w.subject === p.subject),
  );
  return [
    ...wide,
    ...narrow.map((p) => ({
      ...p,
      subject: `${p.subject} at ${phoneWidth} px`,
      message: `On a phone, ${phoneWidth} px wide: ${p.message}`,
    })),
  ];
}

/**
 * Run `plot` in its own context, with JavaScript's globals only, and draw the chart if `draw` is
 * set, in the time limit. Returns what the checked library, the spec, and the drawings show.
 */
export function plotProblems(source: string, data: ChartData, draw: boolean): ChartProblem[] {
  const late: ChartProblem = {
    code: "CHART_PLOT",
    subject: "plot",
    message:
      "plot and drawing the chart did not finish in 1 second. Check plot's loops and accessors.",
  };
  let plot: ReturnType<typeof authorFunction>;
  try {
    plot = authorFunction(source, "yapparatus:plot");
  } catch (error) {
    if (timedOut(error)) return [late];
    return [{ code: "CHART_PLOT", subject: "plot", message: `plot does not compile: ${error}` }];
  }
  if (!plot)
    return [
      {
        code: "CHART_PLOT",
        subject: "plot",
        message: "plot is a function that returns the marks: (Plot, rows) => ({ marks: [...] }).",
      },
    ];
  const call = plot;
  const rows = rowObjects(data);
  const { measure } = fontMeasure();
  measure("0", { ...chartType, tabular: true });
  const warn = console.warn;
  try {
    return withTimeLimit(() => {
      let stopped = false;
      const { spec, problems } = runPlot(
        Plot,
        (library, rows) => {
          try {
            return call(library, rows) as ReturnType<PlotFunction>;
          } catch (error) {
            stopped = timedOut(error);
            throw error;
          }
        },
        rows,
      );
      if (stopped) return [late];
      if (!draw || !spec || problems.some((p) => diagnosticCodes[p.code].severity === "error"))
        return problems;
      return [...problems, ...drawingProblems(spec, rows, measure)];
    });
  } catch (error) {
    return [timedOut(error) ? late : thrownProblem(error)];
  } finally {
    console.warn = warn;
  }
}

/** The JSX attribute of an element with a name, if the author wrote one. */
function attribute(node: MdxJsxFlowElementHast, name: string) {
  return node.attributes.find((a) => a.type === "mdxJsxAttribute" && a.name === name);
}

/** A fenced block's language, text, and the page line its text starts on. */
function blockOf(node: Element) {
  const code = node.tagName === "pre" ? node.children[0] : undefined;
  if (code?.type !== "element" || code.tagName !== "code") return;
  return {
    language: codeLanguageOf(code),
    text: textOf(code),
    line: (node.position?.start.line ?? 0) + 1,
  };
}

const elements = (nodes: ElementContent[], tag: string) =>
  nodes.filter((n): n is Element => n.type === "element" && n.tagName === tag);

/** A Markdown table's header and rows, each row with its line in the page. */
function tableOf(table: Element): RawTable {
  const rows = elements(table.children, "thead")
    .concat(elements(table.children, "tbody"))
    .flatMap((section) => elements(section.children, "tr"));
  const [head, ...body] = rows;
  const cells = (row: Element) =>
    row.children
      .filter((c): c is Element => c.type === "element" && /^t[hd]$/.test(c.tagName))
      .map((c) => textOf(c).trim());
  return {
    header: head ? cells(head) : [],
    headerLine: head?.position?.start.line ?? table.position?.start.line ?? 0,
    rows: body.map((row) => ({ cells: cells(row), line: row.position?.start.line ?? 0 })),
  };
}

/** The Markdown table of each `<Table id>` on a page, by id. */
function pageTables(tree: Root) {
  const tables = new Map<string, Element | undefined>();
  visit(tree, "mdxJsxFlowElement", (node: MdxJsxFlowElementHast) => {
    const id = node.name === "Table" ? attribute(node, "id")?.value : undefined;
    if (typeof id !== "string") return;
    let found: Element | undefined;
    visit({ type: "root", children: node.children } as Root, "element", (child: Element) => {
      if (child.tagName === "table" && !found) found = child;
    });
    tables.set(id, found);
  });
  return tables;
}

/** The stage that reads each `<Chart>`'s data into its `data` or `load` prop. */
export function charts(files: ExternalFiles) {
  return () => (tree: Root, file: { path: string }) => {
    const issues = contentIssues.get(file.path) ?? [];
    contentIssues.set(file.path, issues);
    const tables = pageTables(tree);
    visit(tree, "mdxJsxFlowElement", (node: MdxJsxFlowElementHast) => {
      if (node.name !== "Chart") return;
      const line = node.position?.start.line ?? 0;
      const issue = (subject: string, message: string, at = line) =>
        issues.push({ code: "CHART_DATA", line: at, subject, message });
      const plot = attribute(node, "plot");
      const plotSource =
        plot?.type === "mdxJsxAttribute" && typeof plot.value === "object" && plot.value
          ? plot.value.value
          : undefined;
      const chartId = attribute(node, "id")?.value;
      const check = (data: ChartData, cells: DataIssue[]) => {
        if (plotSource === undefined || !rowCount(data)) return;
        for (const problem of plotProblems(plotSource, data, !cells.length))
          issues.push({
            code: problem.code,
            line,
            ...(typeof chartId === "string" ? { target: chartId } : {}),
            subject: problem.subject ?? problem.code,
            message: problem.message,
          });
      };
      if (plotSource === undefined)
        issues.push({
          code: "CHART_PLOT",
          line,
          subject: "plot",
          message:
            "<Chart> needs plot={(Plot, rows) => ({ marks: [...] })}: a function that returns the marks.",
        });
      const fromAttribute = attribute(node, "from");
      const from =
        fromAttribute?.type === "mdxJsxAttribute" && typeof fromAttribute.value === "string"
          ? fromAttribute.value
          : fromAttribute
            ? null
            : undefined;
      const content = node.children.filter((c) => !(c.type === "text" && !c.value.trim()));
      node.children = [];
      if (from === undefined) {
        const block =
          content.length === 1 && content[0]?.type === "element" ? blockOf(content[0]) : undefined;
        const format = formatNamed(block?.language);
        if (!block || !format) {
          issue(
            "data",
            `<Chart> holds one block of data, fenced with its format (${formatNames()}) as in \`\`\`csv, with a blank line after the opening tag and before the closing tag, or names a table on the page with from="#<table id>", or a file with from="/-/files/<directory>/<file>.csv".`,
          );
          return;
        }
        const read = readData(format, block.text);
        if ("message" in read) {
          issue(read.subject, read.message, block.line + read.line - 1);
          return;
        }
        for (const problem of read.issues)
          issue(problem.subject, problem.message, block.line + problem.line - 1);
        if (!rowCount(read.data)) issue("data", "<Chart> has no rows of data.");
        check(read.data, read.issues);
        setAttribute(node, "data", valueToEstree(read.data));
        return;
      }
      if (content.length) {
        issue(
          "data",
          "<Chart> takes its data from a block inside it or from from, not both. Remove the block, or from.",
        );
        return;
      }
      if (from?.startsWith("#")) {
        const id = from.slice(1);
        if (!tables.has(id)) {
          issue(
            from,
            `<Chart from="${from}"> names no <Table> on this page. Give the table id="${id}", or name a table that has an id: ${[...tables.keys()].map((t) => `"#${t}"`).join(", ") || "the page has none"}.`,
          );
          return;
        }
        const table = tables.get(id);
        if (!table) {
          issue(from, `<Table id="${id}"> holds no Markdown table for the chart to read.`);
          return;
        }
        const { data, issues: found } = typeTable(tableOf(table));
        for (const problem of found)
          issue(problem.subject, `<Chart> in table "${id}": ${problem.message}`, problem.line);
        if (!rowCount(data)) issue("data", "<Chart> has no rows of data.");
        check(data, found);
        setAttribute(node, "data", valueToEstree(data));
        return;
      }
      const address = typeof from === "string" ? parseFileAddress(from) : undefined;
      if (!address || address.lines || !formatOfFile(address.path)) {
        issue(
          from ?? "from",
          `<Chart from> names a table on this page, from="#<table id>", or a whole ${formatNames()} file, from="/-/files/<directory>/<file>.csv", written as a string.`,
        );
        return;
      }
      const read = readChartFile(files, address);
      if ("error" in read) {
        issue(
          read.subject ?? address.path,
          read.line
            ? `<Chart> in ${from}, line ${read.line}: ${read.error}`
            : `<Chart>: ${read.error}`,
        );
        return;
      }
      for (const problem of read.issues)
        issue(problem.subject, `<Chart> in ${from}, line ${problem.line}: ${problem.message}`);
      if (!rowCount(read.data)) issue("data", "<Chart> has no rows of data.");
      check(read.data, read.issues);
      const watched = excerptFiles.get(file.path) ?? new Set<string>();
      watched.add(read.source.file);
      excerptFiles.set(file.path, watched);
      setAttribute(node, "load", {
        type: "ArrowFunctionExpression",
        params: [],
        expression: true,
        body: {
          type: "ImportExpression",
          source: { type: "Literal", value: dataModuleId(address, read.source) },
        },
      } as unknown as Expression);
    });
  };
}

/** Set a prop to a JavaScript expression, replacing any the author wrote. */
function setAttribute(node: MdxJsxFlowElementHast, name: string, expression: Expression) {
  node.attributes = node.attributes.filter(
    (a) => !(a.type === "mdxJsxAttribute" && a.name === name),
  );
  node.attributes.push({
    type: "mdxJsxAttribute",
    name,
    value: {
      type: "mdxJsxAttributeValueExpression",
      value: "",
      data: {
        estree: {
          type: "Program",
          sourceType: "module",
          body: [{ type: "ExpressionStatement", expression }],
        },
      },
    },
  });
}
