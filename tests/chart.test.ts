import assert from "node:assert/strict";
import { test } from "node:test";
import { compile } from "@mdx-js/mdx";
import * as Plot from "@observablehq/plot";
import remarkGfm from "remark-gfm";
import { parseDelimited, type RawTable, rowObjects, typeTable } from "../src/chart/data.ts";
import { type ChartProblem, chartLibrary, checkSpec, firstUseOrder } from "../src/chart/plot.ts";
import { charts, dataModuleCode, readChartFile } from "../src/chart-plugin.ts";
import { excerpts } from "../src/code-plugin.ts";
import { contentIssues } from "../src/markdown-plugin.ts";
import type { SourceFiles } from "../src/source-files.ts";

const table = (header: string[], ...rows: string[][]): RawTable => ({
  header,
  headerLine: 1,
  rows: rows.map((cells, i) => ({ cells, line: i + 2 })),
});

test("each column gets one type from all of its cells", () => {
  const { data, issues } = typeTable(
    table(["Month", "Service", "p99 (ms)"], ["2026-01", "Search", "90"], ["2026-02", "", "1.5e2"]),
  );
  assert.deepEqual(issues, []);
  assert.deepEqual(data.columns, [
    { name: "Month", type: "date" },
    { name: "Service", type: "text" },
    { name: "p99 (ms)", type: "number" },
  ]);
  assert.deepEqual(data.values, [
    ["2026-01", "2026-02"],
    ["Search", null],
    [90, 150],
  ]);
  const [first] = rowObjects(data);
  assert.deepEqual(first?.Month, new Date("2026-01-01T00:00:00.000Z"));
});

test("a unit in a number column is reported at its line, not read as text", () => {
  const { data, issues } = typeTable(table(["ms"], ["12"], ["15 ms"], ["9"]));
  assert.equal(issues.length, 1);
  assert.equal(issues[0]?.line, 3);
  assert.match(
    issues[0]?.message ?? "",
    /"15 ms" in column "ms" is not a number.*unit in the header/,
  );
  assert.equal(data.columns[0]?.type, "text");
});

test("headers must name each column once, and rows must have the header's cells", () => {
  const { issues } = typeTable(table(["a", "a", ""], ["1", "2"]));
  assert.deepEqual(
    issues.map((i) => i.subject),
    ["a", "column 3", "line 2"],
  );
});

test("CSV keeps quoted separators, quotes, and line breaks, and each record's first line", () => {
  const parsed = parseDelimited(
    'name,note\n"Smith, J","said ""hi"""\n\nx,"two\nlines"\ny,z\n',
    ",",
  );
  assert.ok(!("message" in parsed));
  assert.deepEqual(parsed.header, ["name", "note"]);
  assert.deepEqual(parsed.rows, [
    { cells: ["Smith, J", 'said "hi"'], line: 2 },
    { cells: ["x", "two\nlines"], line: 4 },
    { cells: ["y", "z"], line: 6 },
  ]);
  const tsv = parseDelimited("a\tb\r\n1\t2\r\n", "\t");
  assert.ok(!("message" in tsv));
  assert.deepEqual(tsv.rows, [{ cells: ["1", "2"], line: 2 }]);
  assert.ok("message" in parseDelimited('a\n"open', ","));
});

test("marks name columns of their data and take no literal colors", () => {
  const rows = [{ Month: 1, Service: "Search" }];
  const problems: ChartProblem[] = [];
  const P = chartLibrary(Plot, problems);
  P.lineY(rows, { x: "Month", y: "Latency", stroke: "Service" });
  P.dot(rows, { x: "Month", y: "Month", fill: "tomato" });
  P.ruleY([0], { stroke: "currentColor" });
  P.barY(rows, P.groupX({ y: "count" }, { x: "Service", fill: "#f00" }));
  assert.deepEqual(
    problems.map((p) => p.code),
    ["CHART_FIELD", "CHART_COLOR", "CHART_COLOR"],
  );
  assert.match(problems[0]?.message ?? "", /"Latency".*"Month", "Service"/);
});

test("plot returns marks and position scales only", () => {
  assert.deepEqual(checkSpec({ marks: [], y: { type: "log" } }), []);
  assert.match(
    checkSpec({ marks: [], width: 300, color: {} })[0]?.message ?? "",
    /"width", "color"/,
  );
  assert.equal(checkSpec([])[0]?.code, "CHART_OPTION");
});

test("categories take colors in the order the rows first use them", () => {
  const rows = [{ s: "Search" }, { s: "Checkout" }, { s: "Search" }];
  assert.deepEqual(firstUseOrder(["Checkout", "Other", "Search"], rows), [
    "Search",
    "Checkout",
    "Other",
  ]);
});

/** A file the stub directory holds, read as the source files would: 30 rows. */
const csv = `connections,rps\n${Array.from({ length: 30 }, (_, i) => `${i * 10},${1000 + i}`).join("\n")}\n`;
const files = {
  read: () => ({
    file: "/x/throughput.csv",
    source: "source/throughput.csv",
    lines: csv.trimEnd().split("\n"),
  }),
} as unknown as SourceFiles;

/** Compile MDX with the chart step; returns the JS and the issues found. */
async function build(source: string) {
  const file = `/virtual/${Math.random()}.mdx`;
  const js = String(
    await compile(
      { value: source, path: file },
      { remarkPlugins: [remarkGfm], rehypePlugins: [excerpts(files), charts(files)] },
    ),
  );
  return { js, issues: contentIssues.get(file) ?? [] };
}

const plot = 'plot={(Plot, rows) => ({ marks: [Plot.dot(rows, { x: "a", y: "b" })] })}';

const block = (format: string, text: string) =>
  `<Chart ${plot}>\n\n\`\`\`${format}\n${text}\n\`\`\`\n\n</Chart>\n`;

test("a chart's block of data becomes typed data, and the page does not show it", async () => {
  const { js, issues } = await build(block("csv", "a,b\nx,1\ny,2"));
  assert.deepEqual(issues, []);
  assert.ok(js.includes('"values": [["x", "y"], [1, 2]]'));
  assert.match(js, /"name": "b",\s*"type": "number"/);
  assert.ok(!js.includes("_components.pre"));
  // The format is named by the block's language.
  const tsv = await build(block("tsv", "a\tb\nx\t1"));
  assert.deepEqual(tsv.issues, []);
  assert.ok(tsv.js.includes('"values": [["x"], [1]]'));
});

test("a chart reads a table on its page, which stays shown", async () => {
  const table = '<Table id="t">\n\n| a | b |\n|---|---|\n| x | 1 |\n| y | 2 ms |\n\n</Table>\n\n';
  const { js, issues } = await build(`${table.replace("2 ms", "2")}<Chart from="#t" ${plot} />\n`);
  assert.deepEqual(issues, []);
  assert.ok(js.includes('"values": [["x", "y"], [1, 2]]'));
  assert.ok(js.includes("_components.table") || js.includes('"table"'));
  // A cell problem is reported at its row in the table.
  const mixed = await build(`${table}<Chart from="#t" ${plot} />\n`);
  assert.equal(mixed.issues.length, 1);
  assert.equal(mixed.issues[0]?.line, 6);
  // A chart may come before its table, and must name one that exists.
  const before = await build(`<Chart from="#t" ${plot} />\n\n${table.replace("2 ms", "2")}`);
  assert.deepEqual(before.issues, []);
  const missing = await build(`${table}<Chart from="#other" ${plot} />\n`);
  assert.match(missing.issues[0]?.message ?? "", /names no <Table>.*"#t"/);
});

test("a chart's file stays out of the page: the page loads it", async () => {
  const { js, issues } = await build(`<Chart from="/-/files/sample/throughput.csv" ${plot} />\n`);
  assert.deepEqual(issues, []);
  assert.match(
    js,
    /load: \(\) => import\("virtual:yapparatus\/data:sample\/throughput\.csv\?v=[0-9a-f]{12}"\)/,
  );
  assert.ok(!js.includes("1019"));
});

test("a chart file's data module holds its columns", () => {
  const read = readChartFile(files, { folder: "sample", path: "throughput.csv" });
  assert.ok(!("error" in read));
  assert.deepEqual(
    read.data.columns.map((c) => c.type),
    ["number", "number"],
  );
  const code = dataModuleCode(read.data);
  assert.match(code, /^export default JSON\.parse\(/);
  assert.deepEqual(
    JSON.parse(JSON.parse(code.slice("export default JSON.parse(".length, -2))),
    read.data,
  );
});

test("a chart needs one source of data in a known format, and a plot", async () => {
  const cases = {
    none: `<Chart ${plot} />`,
    table: `<Chart ${plot}>\n\n| a |\n|---|\n| 1 |\n\n</Chart>`,
    unknownBlock: block("json", '[{"a": 1}]'),
    both: block("csv", "a\n1").replace("<Chart ", '<Chart from="/-/files/sample/throughput.csv" '),
    json: `<Chart from="/-/files/sample/data.json" ${plot} />`,
    lines: `<Chart from="/-/files/sample/throughput.csv#L2-L3" ${plot} />`,
    noPlot: block("csv", "a\n1").replace(` ${plot}`, ""),
  };
  for (const [name, source] of Object.entries(cases)) {
    const { issues } = await build(`${source}\n`);
    assert.equal(issues.length, 1, name);
    assert.equal(issues[0]?.code, "CHART", name);
  }
});

test("a mixed column is reported at the page line of its row", async () => {
  const { issues } = await build(`# T\n\n${block("csv", "a,b\nx,1\ny,2 ms")}`);
  assert.equal(issues.length, 1);
  assert.equal(issues[0]?.line, 8);
  assert.match(issues[0]?.message ?? "", /"2 ms" in column "b"/);
});
