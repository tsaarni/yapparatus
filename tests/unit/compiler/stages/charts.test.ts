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
    assert.equal(issues[0]?.code, name === "noPlot" ? "CHART_PLOT" : "CHART_DATA", name);
  }
});

test("a mixed column is reported at the page line of its row", async () => {
  const { issues } = await build(`# T\n\n${block("csv", "a,b\nx,1\ny,2 ms")}`);
  assert.equal(issues.length, 1);
  assert.equal(issues[0]?.line, 8);
  assert.match(issues[0]?.message ?? "", /"2 ms" in column "b"/);
});
