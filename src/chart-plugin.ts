/**
 * `<Chart>` data, read when the page is compiled. A chart holds one block of data, such as
 * ```csv, names a `<Table>` on its page with `from="#id"`, or names a file with `from`. A block
 * or a table is small and already in the page, so it becomes the `data` prop. A file can be
 * large, so the page only refers to it: `load` imports the data from its own module. All are
 * checked here, and an edit to the file updates the page.
 */
import { valueToEstree } from "estree-util-value-to-estree";
import type { Element, ElementContent, Root } from "hast";
import { toString as textOf } from "hast-util-to-string";
import type { MdxJsxFlowElementHast } from "mdast-util-mdx-jsx";
import { visit } from "unist-util-visit";
import {
  type ChartData,
  type DataIssue,
  type RawTable,
  rowCount,
  typeTable,
} from "./chart/data.ts";
import { type DataFormat, formatNamed, formatNames, formatOfFile } from "./chart/formats.ts";
import { excerptFiles } from "./code-plugin.ts";
import { type FileAddress, parseFileAddress } from "./files.ts";
import { contentIssues } from "./markdown-plugin.ts";
import type { SourceFile, SourceFiles } from "./source-files.ts";
import { revision } from "./source-plugin.ts";

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

export interface ChartFile {
  source: SourceFile;
  data: ChartData;
  /** Problems with the cells, each with its line in the file. */
  issues: DataIssue[];
}

/** Read and type a chart's file, or say why it cannot be read. */
export function readChartFile(
  files: SourceFiles,
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

function attribute(node: MdxJsxFlowElementHast, name: string) {
  return node.attributes.find((a) => a.type === "mdxJsxAttribute" && a.name === name);
}

/** A fenced block's language, text, and the page line its text starts on. */
function blockOf(node: Element) {
  const code = node.tagName === "pre" ? node.children[0] : undefined;
  if (code?.type !== "element" || code.tagName !== "code") return;
  const classes = code.properties.className;
  const language = (Array.isArray(classes) ? classes : [])
    .map(String)
    .find((c) => c.startsWith("language-"))
    ?.slice("language-".length);
  return { language, text: textOf(code), line: (node.position?.start.line ?? 0) + 1 };
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

export function charts(files: SourceFiles) {
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
      if (plot?.type !== "mdxJsxAttribute" || typeof plot.value !== "object" || !plot.value)
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
      // The data is read here and goes to the chart as a prop; the page never shows it.
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
      // The page checks the file's columns, so it depends on the file.
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
