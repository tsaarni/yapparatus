/** Drawing a chart without a browser: margins from label boxes, overlaps, colors, and warnings. */

import assert from "node:assert/strict";
import { test } from "node:test";
import * as Plot from "@observablehq/plot";
import { parseHTML } from "linkedom";
import { type ChartInput, drawChart } from "../../../src/chart/drawing.ts";
import { labelsOf } from "../../../src/chart/labels.ts";
import { marginsOf, type PlotDrawing } from "../../../src/chart/margins.ts";
import type { ChartSpec, Row } from "../../../src/chart/spec.ts";
import { quadsOverlap } from "../../../src/chart/text-box.ts";
import type { Measure } from "../../../src/diagram/metrics.ts";

/** Wide enough for Inter: 0.55 em per character, 0.6 em for tabular digits. */
const measure: Measure = (text, font) => text.length * font.size * (font.tabular ? 0.6 : 0.55);
const font = { family: "Test", size: 12, weight: 400, ascent: 0.97, descent: 0.24 };
const colors = { categories: ["#c1", "#c2", "#c3", "#c4"], muted: "#muted", text: "#text" };

/** Draw a chart at a width in a document without a browser. */
function draw(spec: ChartSpec, rows: Row[], width = 970) {
  const { document } = parseHTML("<!doctype html><html><body></body></html>");
  const input: ChartInput = {
    Plot,
    spec,
    rows,
    width,
    document: document as unknown as Document,
    font,
    measure,
    colors,
  };
  return drawChart(input);
}

const days: Row[] = Array.from({ length: 31 }, (_, i) => ({
  Day: new Date(Date.UTC(2026, 9, i + 1)),
  Deploys: (i * 7) % 11,
}));
const projects: Row[] = [
  "data-warehouse-ingestion-pipeline",
  "api",
  "frontend-web-app",
  "billing",
  "search-indexer",
  "auth",
].map((name, i) => ({ Project: name, Minutes: 10 + i * 13, Team: i % 2 ? "b" : "platform-team" }));

test("two-line date ticks grow the bottom margin, not the right, and Plot's warning is reported", () => {
  const warn = console.warn;
  const drawn = draw({ marks: [Plot.barY(days, { x: "Day", y: "Deploys" })] }, days);
  assert.equal(console.warn, warn);
  assert.ok(drawn.svg);
  const margins = marginsOf(drawn.svg as PlotDrawing);
  assert.equal(margins.right, 20);
  assert.ok(margins.bottom > 30, `bottom margin ${margins.bottom}`);
  const labels = labelsOf(drawn.svg, font, measure);
  const day = labels.titles.x;
  assert.ok(day);
  const below = labels.ticks.x.filter(
    (t) => t.box.right > day.box.left && t.box.left < day.box.right,
  );
  assert.ok(below.length > 0);
  assert.ok(below.every((tick) => tick.box.bottom <= day.box.top));
  assert.deepEqual(
    drawn.problems.map((p) => p.code),
    ["CHART_WARNING"],
  );
  assert.match(drawn.problems[0]?.message ?? "", /are dates.*Plot\.rectY with interval/);
  assert.ok(![...drawn.svg.querySelectorAll("text")].some((t) => t.textContent?.includes("⚠")));
});

test("long tick labels that run into each other are an overlap, and rotated ones are not", () => {
  const bars = (x: ChartSpec["x"]) =>
    draw(
      { marks: [Plot.barY(projects, { x: "Project", y: "Minutes" })], ...(x && { x }) },
      projects,
    );
  const flat = bars(undefined);
  assert.deepEqual(
    flat.problems.map((p) => [p.code, p.subject]),
    [["CHART_OVERLAP", "x"]],
  );
  const rotated = bars({ tickRotate: -30 });
  assert.deepEqual(rotated.problems, []);
  assert.ok(rotated.svg && marginsOf(rotated.svg as PlotDrawing).bottom > 100);
});

test("a y label on a band scale moves the tick labels away instead of overlapping them", () => {
  const drawn = draw({ marks: [Plot.boxX(projects, { y: "Team", x: "Minutes" })] }, projects);
  assert.deepEqual(drawn.problems, []);
  assert.ok(drawn.svg);
  const labels = labelsOf(drawn.svg, font, measure);
  const team = labels.titles.y;
  assert.ok(team);
  for (const tick of labels.ticks.y)
    assert.ok(!tick.quads.some((q) => team.quads.some((t) => quadsOverlap(q, t))));
});

test("categories take the colors in order of first use, and the rest are muted and reported", () => {
  const drawn = draw(
    { marks: [Plot.dot(projects, { x: "Minutes", y: "Minutes", fill: "Project" })] },
    projects,
  );
  assert.deepEqual(
    drawn.legend.map((e) => e.color),
    ["#c1", "#c2", "#c3", "#c4", "#muted", "#muted"],
  );
  assert.equal(drawn.legend[0]?.value, "data-warehouse-ingestion-pipeline");
  assert.deepEqual(
    drawn.problems.map((p) => p.code),
    ["TOO_MANY_CATEGORIES"],
  );
});

test("an error Plot throws while drawing is a problem, with no drawing", () => {
  const drawn = draw(
    { marks: [Plot.dot(days, { x: "Day", y: "Deploys" })], x: { type: "nope" as "utc" } },
    days,
  );
  assert.equal(drawn.svg, undefined);
  assert.deepEqual(
    drawn.problems.map((p) => p.code),
    ["CHART_FAILED"],
  );
});
