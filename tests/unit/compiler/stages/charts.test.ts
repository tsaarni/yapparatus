/**
 * The chart stage: inline, table, and file data become typed data, and data errors are reported.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { compile } from "@mdx-js/mdx";
import remarkGfm from "remark-gfm";
import type { ExternalFiles } from "../../../../src/compiler/external-files.ts";
import { charts, dataModuleCode, readChartFile } from "../../../../src/compiler/stages/charts.ts";
import { contentIssues } from "../../../../src/compiler/stages/conventions.ts";
import { excerpts } from "../../../../src/compiler/stages/excerpts.ts";

/** A file the stub directory holds, read as the source files would: 30 rows. */
const csv = `connections,rps\n${Array.from({ length: 30 }, (_, i) => `${i * 10},${1000 + i}`).join("\n")}\n`;

const files = {
  read: () => ({
    file: "/x/throughput.csv",
    source: "source/throughput.csv",
    lines: csv.trimEnd().split("\n"),
  }),
} as unknown as ExternalFiles;

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
  const mixed = await build(`${table}<Chart from="#t" ${plot} />\n`);
  assert.equal(mixed.issues.length, 1);
  assert.equal(mixed.issues[0]?.line, 6);
  const before = await build(`<Chart from="#t" ${plot} />\n\n${table.replace("2 ms", "2")}`);
  assert.deepEqual(before.issues, []);
  const missing = await build(`${table}<Chart from="#other" ${plot} />\n`);
  assert.match(missing.issues[0]?.message ?? "", /names no <Table>.*"#t"/);
});

test("a chart's file stays out of the page: the page loads it", async () => {
  const { js, issues } = await build(
    `<Chart from="/-/files/sample/throughput.csv" ${plot.replace('"a"', '"connections"').replace('"b"', '"rps"')} />\n`,
  );
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
    assert.equal(issues[0]?.code, name === "noPlot" ? "CHART_PLOT" : "CHART_DATA", name);
  }
});

test("a mixed column is reported at the page line of its row", async () => {
  const { issues } = await build(`# T\n\n${block("csv", "a,b\nx,1\ny,2 ms")}`);
  assert.equal(issues.length, 1);
  assert.equal(issues[0]?.line, 8);
  assert.match(issues[0]?.message ?? "", /"2 ms" in column "b"/);
});

test("the stage runs plot and reports what its marks name, before any browser draws it", async () => {
  const source = (marks: string) =>
    `<Chart id="speed" plot={(Plot, rows) => ({ marks: [${marks}] })}>\n\n\`\`\`csv\na,b,kind\n1,2,x\n\`\`\`\n\n</Chart>\n`;
  const field = await build(source('Plot.dot(rows, { x: "a", y: "c" })'));
  assert.deepEqual(
    field.issues.map((i) => [i.code, i.target, i.subject]),
    [["CHART_FIELD", "speed", "Plot.dot y: c"]],
  );
  const color = await build(source('Plot.dot(rows, { x: "a", y: "b", fill: "tomato" })'));
  assert.deepEqual(
    color.issues.map((i) => i.code),
    ["CHART_COLOR"],
  );
  const column = await build(source('Plot.dot(rows, { x: "a", y: "b", fill: "kinds" })'));
  assert.deepEqual(
    column.issues.map((i) => i.code),
    ["CHART_FIELD"],
  );
  const thrown = await build(source("Plot.nothing(rows)"));
  assert.deepEqual(
    thrown.issues.map((i) => i.code),
    ["CHART_FAILED"],
  );
  const clean = await build(source('Plot.dot(rows, { x: "a", y: "b", fill: "kind" })'));
  assert.deepEqual(clean.issues, []);
});

test("a plot that does not end is stopped after 1 second", async () => {
  const started = Date.now();
  const { issues } = await build(
    `<Chart id="endless" plot={(Plot, rows) => { for (;;) Plot.dot(rows, { x: "a" }) }}>\n\n\`\`\`csv\na\n1\n\`\`\`\n\n</Chart>\n`,
  );
  assert.ok(Date.now() - started < 3000);
  assert.deepEqual(
    issues.map((i) => [i.code, i.subject, i.message]),
    [["CHART_PLOT", "plot", late]],
  );
});

const late =
  "plot and drawing the chart did not finish in 1 second. Check plot's loops and accessors.";

test("an accessor that does not end stops the drawing after 1 second, and Plot's warnings end", async () => {
  const warn = console.warn;
  const started = Date.now();
  const { issues } = await build(
    `<Chart id="slow" plot={(Plot, rows) => ({ marks: [Plot.dot(rows, { x: (d) => { for (;;); }, y: "a" })] })}>\n\n\`\`\`csv\na\n1\n\`\`\`\n\n</Chart>\n`,
  );
  assert.ok(Date.now() - started < 3000);
  assert.deepEqual(
    issues.map((i) => [i.code, i.message]),
    [["CHART_PLOT", late]],
  );
  assert.equal(console.warn, warn);
});

test("the stage draws each chart and reports what the drawing shows, at the page's line", async () => {
  const days = Array.from(
    { length: 31 },
    (_, i) => `2026-10-${String(i + 1).padStart(2, "0")},${i % 7}`,
  );
  const deploys = await build(
    `# Deploys\n\n<Chart id="deploys" plot={(Plot, rows) => ({ marks: [Plot.barY(rows, { x: "Day", y: "Deploys" })] })}>\n\n\`\`\`csv\nDay,Deploys\n${days.join("\n")}\n\`\`\`\n\n</Chart>\n`,
  );
  assert.deepEqual(
    deploys.issues.map((i) => [i.code, i.target, i.line, i.subject]),
    [
      ["CHART_WARNING", "deploys", 3, "some data associated with the x scale are dates"],
      ["CHART_OVERLAP", "deploys", 3, "x at 320 px"],
    ],
  );
  assert.match(deploys.issues[1]?.message ?? "", /^On a phone, 320 px wide: The x tick labels/);
  const colors = await build(
    `<Chart id="kinds" plot={(Plot, rows) => ({ marks: [Plot.dot(rows, { x: "a", y: "a", fill: "kind" })] })}>\n\n\`\`\`csv\na,kind\n${[1, 2, 3, 4, 5].map((n) => `${n},k${n}`).join("\n")}\n\`\`\`\n\n</Chart>\n`,
  );
  assert.deepEqual(
    colors.issues.map((i) => i.code),
    ["TOO_MANY_CATEGORIES"],
  );
});

test("a chart's file is drawn too", async () => {
  const { issues } = await build(
    `<Chart from="/-/files/sample/throughput.csv" plot={(Plot, rows) => ({ marks: [Plot.barY(rows, { x: "connections", y: "rps" })] })} />\n`,
  );
  assert.deepEqual(
    issues.map((i) => [i.code, i.subject]),
    [["CHART_OVERLAP", "x at 320 px"]],
  );
});
