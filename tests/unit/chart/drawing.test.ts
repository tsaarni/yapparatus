/** Drawing a chart without a browser: margins, height, overlaps, warnings, legends, and paint. */

import assert from "node:assert/strict";
import { test } from "node:test";
import * as Plot from "@observablehq/plot";
import { parseHTML } from "linkedom";
import { type ChartInput, drawChart } from "../../../src/chart/drawing.ts";
import { labelsOf } from "../../../src/chart/labels.ts";
import { marginsOf, type PlotDrawing } from "../../../src/chart/margins.ts";
import type { ChartPaint } from "../../../src/chart/paint.ts";
import { oklabRamp } from "../../../src/chart/ramp.ts";
import type { ChartSpec, Row } from "../../../src/chart/spec.ts";
import { quadsOverlap } from "../../../src/chart/text-box.ts";
import type { Measure } from "../../../src/figure/font.ts";

/** Wide enough for Inter: 0.55 em per character, 0.6 em for tabular digits. */
const measure: Measure = (text, font) => text.length * font.size * (font.tabular ? 0.6 : 0.55);
const font = { family: "Test", size: 12, weight: 400, ascent: 0.97, descent: 0.24 };
const paint: ChartPaint = {
  categories: ["#c10000", "#c20000", "#c30000", "#c40000"],
  accent: "#3d4fd6",
  accentSurface: "#ccd3f7",
  text: "#111111",
  textBody: "#222222",
  textMuted: "#555555",
  rule: "#888888",
  grid: "#cccccc",
  surface: "#f5f6f8",
  ramp: oklabRamp("#ccd3f7", "#3d4fd6"),
};

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
    paint,
    id: "test",
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
    drawn.legend?.kind === "categories" && drawn.legend.entries.map((e) => e.color),
    ["#c10000", "#c20000", "#c30000", "#c40000", "#555555", "#555555"],
  );
  assert.equal(
    drawn.legend?.kind === "categories" && drawn.legend.entries[0]?.value,
    "data-warehouse-ingestion-pipeline",
  );
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

const zones: Row[] = Array.from({ length: 12 }, (_, i) => ({
  CPU: 20 + i * 6,
  Errors: 0.1 + (i * i) / 30,
  Zone: ["a", "b", "c"][i % 3] as string,
}));
const heat: Row[] = ["Mon", "Tue", "Wed"].flatMap((Day, d) =>
  [0, 6, 12].map((Hour, h) => ({ Day, Hour: `${Hour}h`, Errors: 1 + d * 3 + h * 9 })),
);

/** The attributes of each element in a group with an ARIA label. */
const shapes = (svg: Element | undefined, label: string, tag: string) => [
  ...(svg?.querySelectorAll(`g[aria-label="${label}"] ${tag}`) ?? []),
];

test("a painted drawing has only literal colors and attributes, which a picture renderer reads", () => {
  const charts: Array<[ChartSpec, Row[]]> = [
    [{ marks: [Plot.boxX(projects, { y: "Team", x: "Minutes" })] }, projects],
    [
      {
        marks: [
          Plot.dot(zones, { x: "CPU", y: "Errors", stroke: "Zone" }),
          Plot.linearRegressionY(zones, { x: "CPU", y: "Errors" }),
          Plot.text(zones, Plot.selectLast({ x: "CPU", y: "Errors", text: "Zone" })),
        ],
      },
      zones,
    ],
    [
      {
        marks: [
          Plot.cell(heat, { x: "Hour", y: "Day", fill: "Errors" }),
          Plot.text(heat, { x: "Hour", y: "Day", text: "Errors" }),
        ],
      },
      heat,
    ],
    [
      { marks: [Plot.link(zones, { x1: "CPU", x2: "Errors", y: "Zone", markerEnd: "arrow" })] },
      zones,
    ],
    [{ marks: [Plot.barY(days, { x: "Day", y: "Deploys" }), Plot.ruleY([0])] }, days],
  ];
  for (const [spec, rows] of charts) {
    const { svg } = draw(spec, rows);
    const markup = svg?.outerHTML ?? "";
    assert.ok(markup.length > 0);
    for (const css of ["currentColor", "var(", "light-dark(", "color-mix(", "<style"])
      assert.ok(!markup.includes(css), `${css} in ${spec.marks.length} marks`);
  }
});

test("marks without a color take the accent, and bars under such a line are tinted", () => {
  const bars = draw({ marks: [Plot.barY(projects, { x: "Project", y: "Minutes" })] }, projects);
  const bar = bars.svg?.querySelector('g[aria-label="bar"]');
  assert.equal(bar?.getAttribute("fill"), paint.accent);
  assert.ok(shapes(bars.svg, "bar", "rect").every((r) => r.getAttribute("rx") === "2.5"));
  const layered = draw(
    {
      marks: [
        Plot.barY(days, { x: "Day", y: "Deploys" }),
        Plot.lineY(days, Plot.windowY({ k: 7 }, { x: "Day", y: "Deploys" })),
      ],
    },
    days,
  );
  const under = layered.svg?.querySelector('g[aria-label="bar"]');
  assert.equal(under?.getAttribute("fill"), paint.accentSurface);
  assert.equal(under?.getAttribute("stroke"), paint.accent);
  const line = layered.svg?.querySelector('g[aria-label="line"]');
  assert.equal(line?.getAttribute("stroke"), paint.accent);
  assert.equal(line?.getAttribute("stroke-width"), "2");
});

test("hollow dots become filled in their category's color, at least 4 px, ringed in the surface", () => {
  const { svg } = draw(
    { marks: [Plot.dot(zones, { x: "CPU", y: "Errors", stroke: "Zone" })] },
    zones,
  );
  const dots = shapes(svg, "dot", "circle");
  assert.equal(dots.length, zones.length);
  assert.deepEqual(
    new Set(dots.map((d) => d.getAttribute("fill"))),
    new Set(["#c10000", "#c20000", "#c30000"]),
  );
  assert.ok(dots.every((d) => d.getAttribute("stroke") === paint.surface));
  assert.ok(dots.every((d) => Number(d.getAttribute("r")) >= 4));
});

test("a box plot has a tinted box, muted whiskers, and an accent median", () => {
  const { svg } = draw({ marks: [Plot.boxX(projects, { y: "Team", x: "Minutes" })] }, projects);
  const bar = svg?.querySelector('g[aria-label="bar"]');
  assert.equal(bar?.getAttribute("fill"), paint.accentSurface);
  assert.equal(bar?.getAttribute("stroke"), paint.accent);
  assert.equal(svg?.querySelector('g[aria-label="rule"]')?.getAttribute("stroke"), paint.textMuted);
  assert.equal(svg?.querySelector('g[aria-label="tick"]')?.getAttribute("stroke"), paint.accent);
});

test("a regression is clipped to the frame, with a faint band", () => {
  const { svg } = draw(
    {
      marks: [
        Plot.dot(zones, { x: "CPU", y: "Errors" }),
        Plot.linearRegressionY(zones, { x: "CPU", y: "Errors" }),
      ],
    },
    zones,
  );
  const group = svg?.querySelector('g[aria-label="linear-regression"]');
  assert.equal(group?.getAttribute("clip-path"), "url(#test-clip-0)");
  assert.ok(svg?.querySelector("#test-clip-0 rect"));
  assert.ok(svg?.outerHTML.includes("<clipPath"));
  const band = [...(group?.querySelectorAll("path") ?? [])].find(
    (p) => p.getAttribute("stroke") === "none",
  );
  assert.equal(band?.getAttribute("fill-opacity"), "0.14");
});

test("a number column in fill is a ramp with a ramp legend, and text on dark cells is light", () => {
  const drawn = draw(
    {
      marks: [
        Plot.cell(heat, { x: "Hour", y: "Day", fill: "Errors" }),
        Plot.text(heat, { x: "Hour", y: "Day", text: "Errors" }),
      ],
    },
    heat,
  );
  assert.deepEqual(drawn.legend, { kind: "ramp", low: 1, high: 25 });
  assert.deepEqual(drawn.problems, []);
  const fills = shapes(drawn.svg, "cell", "rect").map((r) => r.getAttribute("fill"));
  assert.ok(fills.includes(paint.ramp(0)) && fills.includes(paint.ramp(1)));
  const texts = shapes(drawn.svg, "text", "text");
  const color = (value: string) => texts.find((t) => t.textContent === value)?.getAttribute("fill");
  assert.equal(color("1"), paint.text);
  assert.equal(color("25"), paint.surface);
});

test("the legend is left out when it repeats a shown axis, and kept when that axis is hidden", () => {
  const spec = (x: ChartSpec["x"]) => ({
    marks: [Plot.barY(projects, { x: "Team", y: "Minutes", fill: "Team" })],
    ...(x && { x }),
  });
  assert.equal(draw(spec(undefined), projects).legend, undefined);
  assert.equal(draw(spec({ axis: null }), projects).legend?.kind, "categories");
});

test("a band y scale gets a height per band, and a continuous one a height from the width", () => {
  const height = (spec: ChartSpec, width = 970) =>
    Number(draw(spec, projects, width).svg?.getAttribute("height"));
  const bars = { marks: [Plot.barX(projects, { y: "Project", x: "Minutes" })] };
  const tall = height(bars);
  const { svg } = draw(bars, projects);
  const { top, bottom } = marginsOf(svg as PlotDrawing);
  assert.equal(tall, projects.length * 30 + top + bottom);
  const dots = { marks: [Plot.dot(projects, { x: "Minutes", y: "Minutes" })] };
  assert.equal(height(dots), 380);
  assert.equal(height(dots, 320), 220);
  assert.equal(height(dots, 600), 300);
});

test("a chart of points is inset, and a bar chart keeps its baseline on the frame", () => {
  const below = (spec: ChartSpec) => {
    const svg = draw(spec, projects).svg as PlotDrawing;
    return Number(svg.getAttribute("height")) - Math.max(...(svg.scale("y")?.range ?? []));
  };
  const bars = below({ marks: [Plot.barY(projects, { x: "Team", y: "Minutes" })] });
  assert.equal(bars, 30);
  assert.equal(below({ marks: [Plot.dot(projects, { x: "Team", y: "Minutes" })] }), bars + 6);
});

test("few bars on a band x scale stay narrow, with room around them", () => {
  const two = projects.slice(0, 2);
  const { svg } = draw({ marks: [Plot.barY(two, { x: "Project", y: "Minutes" })] }, two);
  const widths = shapes(svg, "bar", "rect").map((r) => Number(r.getAttribute("width")));
  assert.equal(widths.length, 2);
  assert.ok(
    widths.every((w) => w <= 96 && w > 80),
    `widths ${widths}`,
  );
});
