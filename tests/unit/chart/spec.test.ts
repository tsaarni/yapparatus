/** Chart plot checks: marks name data columns, no literal colors, categories colored in order. */

import assert from "node:assert/strict";
import { test } from "node:test";
import * as Plot from "@observablehq/plot";
import {
  type ChartProblem,
  chartLibrary,
  checkSpec,
  firstUseOrder,
} from "../../../src/chart/spec.ts";

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
