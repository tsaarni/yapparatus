/** Stacked areas with unstacked lines over them are reported, and the suggested fixes work. */

import assert from "node:assert/strict";
import { test } from "node:test";
import * as Plot from "@observablehq/plot";
import { parseHTML } from "linkedom";
import { type ChartSpec, type Row, runPlot } from "../../../src/chart/spec.ts";

const rows: Row[] = ["Envoy", "Nginx"].flatMap((Server, s) =>
  [0, 10, 20, 30].map((Minute) => ({ Minute, Server, "Memory (MB)": 100 + s * 50 + Minute })),
);

/** The codes `plot` reports for marks. */
const codes = (marks: (P: typeof Plot) => ChartSpec["marks"]) =>
  runPlot(Plot, (P) => ({ marks: marks(P) }), rows).problems.map((p) => p.code);

/** The top edges of the areas and the paths of the lines of a drawing. */
function edges(marks: ChartSpec["marks"]) {
  const { document } = parseHTML("<!doctype html><html><body></body></html>");
  const svg = Plot.plot({ marks, document: document as unknown as Document });
  const paths = (label: string) =>
    [...svg.querySelectorAll(`g[aria-label="${label}"] path`)].map(
      (p) => p.getAttribute("d") ?? "",
    );
  const tops = paths("area").map((d) => d.split("L").slice(0, 4).join("L"));
  return { tops: tops.sort(), lines: paths("line").sort() };
}

test("an area that stacks a series and a line over the same columns is CHART_STACK", () => {
  assert.deepEqual(
    codes((P) => [
      P.areaY(rows, { x: "Minute", y: "Memory (MB)", fill: "Server" }),
      P.lineY(rows, { x: "Minute", y: "Memory (MB)", stroke: "Server" }),
    ]),
    ["CHART_STACK"],
  );
  const [problem] = runPlot(
    Plot,
    (P) => ({
      marks: [
        P.areaY(rows, { x: "Minute", y: "Memory (MB)", fill: "Server" }),
        P.lineY(rows, { x: "Minute", y: "Memory (MB)", stroke: "Server" }),
      ],
    }),
    rows,
  ).problems;
  assert.match(problem?.message ?? "", /y1: 0, fill: "Server", fillOpacity: 0.3/);
  assert.match(problem?.message ?? "", /Plot\.stackY2\(\{ x: "Minute", y: "Memory \(MB\)"/);
});

test("both fixes the message suggests put the lines on the areas' top edges, and are not reported", () => {
  const fromZero = [
    Plot.areaY(rows, { x: "Minute", y: "Memory (MB)", y1: 0, fill: "Server", fillOpacity: 0.3 }),
    Plot.lineY(rows, { x: "Minute", y: "Memory (MB)", stroke: "Server" }),
  ];
  const stacked = [
    Plot.areaY(rows, { x: "Minute", y: "Memory (MB)", fill: "Server" }),
    Plot.lineY(rows, Plot.stackY2({ x: "Minute", y: "Memory (MB)", stroke: "Server" })),
  ];
  for (const marks of [fromZero, stacked]) {
    const { tops, lines } = edges(marks);
    assert.equal(lines.length, 2);
    assert.deepEqual(tops, lines);
    assert.deepEqual(
      codes(() => marks),
      [],
    );
  }
});

test("a single area with a line, and a windowed line, are not reported", () => {
  assert.deepEqual(
    codes((P) => [
      P.areaY(rows, { x: "Minute", y: "Memory (MB)" }),
      P.lineY(rows, { x: "Minute", y: "Memory (MB)" }),
    ]),
    [],
  );
  assert.deepEqual(
    codes((P) => [
      P.areaY(rows, { x: "Minute", y: "Memory (MB)", fill: "Server" }),
      P.lineY(rows, P.windowY({ k: 2 }, { x: "Minute", y: "Memory (MB)", stroke: "Server" })),
    ]),
    [],
  );
});
