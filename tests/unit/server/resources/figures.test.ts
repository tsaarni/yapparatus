/**
 * Chart pictures: the drawing the page compiler checked, as an SVG with text as outlines and only
 * literal colors, with its legend, and as a PNG.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { compile } from "@mdx-js/mdx";
import type { DrawnChart } from "../../../../src/chart/picture.ts";
import type { ExternalFiles } from "../../../../src/compiler/external-files.ts";
import { charts, pageCharts } from "../../../../src/compiler/stages/charts.ts";
import { chartPicture, chartPictureSvg } from "../../../../src/server/resources/figures.ts";

/** The drawings of a page's charts, compiled with the chart stage, by id. */
async function drawings(source: string) {
  const path = `/virtual/${Math.random()}.mdx`;
  await compile({ value: source, path }, { rehypePlugins: [charts({} as ExternalFiles)] });
  return pageCharts.get(path) ?? new Map();
}

/** A chart with an id, its marks, and a CSV block. */
const chart = (id: string, marks: string, csv: string) =>
  `<Chart id="${id}" plot={(Plot, rows) => ({ marks: [${marks}] })}>\n\n\`\`\`csv\n${csv}\n\`\`\`\n\n</Chart>\n`;

const page = [
  chart(
    "share",
    'Plot.barY(rows, { x: "Year", y: "Share", fill: "Browser" }), Plot.text(rows, { x: "Year", y: "Share", text: "Browser" })',
    "Year,Browser,Share\n2024,Chrome,65\n2024,Safari,18\n2025,Chrome,68\n2025,Safari,16",
  ),
  chart(
    "errors",
    'Plot.cell(rows, { x: "Hour", y: "Day", fill: "Errors" }), Plot.text(rows, { x: "Hour", y: "Day", text: "Errors" })',
    "Day,Hour,Errors\nMon,0,2\nMon,12,14\nTue,0,1\nTue,12,31",
  ),
  chart(
    "spread",
    'Plot.boxX(rows, { x: "Minutes", y: "Team" }), Plot.ruleX([0])',
    "Team,Minutes\nSearch,8\nSearch,9\nSearch,30\nPayments,28\nPayments,31\nPayments,35",
  ),
  chart(
    "trend",
    'Plot.areaY(rows, { x: "Day", y: "Load" }), Plot.lineY(rows, { x: "Day", y: "Load" }), Plot.dot(rows, { x: "Day", y: "Load" }), Plot.tip(rows, { x: "Day", y: "Load" }), Plot.ruleY([0])',
    "Day,Load\n2026-01-01,3\n2026-01-02,5\n2026-01-03,4",
  ),
  chart("broken", 'Plot.dot(rows, { x: "Missing", y: "b" })', "a,b\n1,2"),
].join("\n");

test("a chart's picture has no text, no CSS colors, and its legend", async () => {
  const drawn = await drawings(page);
  for (const id of ["share", "errors", "spread", "trend"]) {
    const svg = chartPictureSvg(drawn.get(id) as DrawnChart);
    assert.match(svg, /^<svg[^>]* xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    for (const leftover of ["<text", "<tspan", "var(", "color-mix(", "light-dark(", "currentColor"])
      assert.ok(!svg.includes(leftover), `${id} has ${leftover}`);
    assert.ok(!/ (style|class)="/.test(svg), `${id} has a style or class`);
  }
  const share = chartPictureSvg(drawn.get("share") as DrawnChart);
  assert.match(share, /paint-order="stroke"/);
  assert.equal((share.match(/<rect[^>]* rx="4"/g) ?? []).length, 2);
  const errors = chartPictureSvg(drawn.get("errors") as DrawnChart);
  assert.match(errors, /<linearGradient id="legend-ramp">/);
});

test("a chart's picture is a PNG at twice the drawing's size", async () => {
  const drawing = (await drawings(page)).get("share") as DrawnChart;
  const png = Buffer.from(chartPicture(drawing));
  assert.equal(png.subarray(1, 4).toString(), "PNG");
  assert.equal(png.readUInt32BE(16), Number(drawing.svg.getAttribute("width")) * 2);
  assert.ok(png.readUInt32BE(20) > Number(drawing.svg.getAttribute("height")) * 2);
});

test("a chart with errors has an id and no drawing", async () => {
  const drawn = await drawings(page);
  assert.ok(drawn.has("broken"));
  assert.equal(drawn.get("broken"), undefined);
});
