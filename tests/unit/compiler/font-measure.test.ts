/**
 * The Node font measure: font subsets, kerning, weights, sizes, monospace, and missing characters.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import * as fontkit from "fontkit";
import { fontMeasure, fontStylesheets } from "../../../src/compiler/font-measure.ts";
import { lucideIcons } from "../../../src/compiler/lucide-icons.ts";
import type { DiagramBuilder } from "../../../src/diagram/builder.ts";
import { compileFigure } from "../../../src/diagram/figure.ts";
import { defaultMetrics as m } from "../../../src/diagram/metrics.ts";
import { examples } from "../diagram/examples.ts";

const require = createRequire(import.meta.url);
const sans = (weight: number, size: number) => ({ family: m.sans, weight, size });
const mono = (size: number) => ({ family: m.mono, weight: m.textWeight, size });

/** The width of text in one Inter subset file, laid out by fontkit directly. */
function inFile(
  subset: string,
  text: string,
  weight: number,
  size: number,
  script?: string,
): number {
  const file = require.resolve(
    `@fontsource-variable/inter/files/inter-${subset}-standard-normal.woff2`,
  );
  const font = (fontkit.openSync(file) as fontkit.Font).getVariation({ wght: weight, opsz: 14 });
  return (font.layout(text, undefined, script).advanceWidth / font.unitsPerEm) * size;
}

const near = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}`);

test("the web app loads the stylesheets the measure reads", () => {
  const main = readFileSync("src/web/main.tsx", "utf8");
  const imported = [...main.matchAll(/^import "(@fontsource[^"]+)";$/gm)].map(([, s]) => s);
  assert.deepEqual(imported, fontStylesheets);
});

test("each character is measured with the subset file whose unicode-range has it", () => {
  const { measure } = fontMeasure();
  near(measure("Café", sans(400, 12)), inFile("latin", "Café", 400, 12));
  near(
    measure("Łódź", sans(400, 12)),
    inFile("latin-ext", "Ł", 400, 12) +
      inFile("latin", "ód", 400, 12) +
      inFile("latin-ext", "ź", 400, 12),
  );
  near(
    measure("Ωmega", sans(400, 12)),
    inFile("greek", "Ω", 400, 12) + inFile("latin", "mega", 400, 12),
  );
  near(measure("Жук", sans(400, 12)), inFile("cyrillic", "Жук", 400, 12));
});

test("a run without letters is kerned once, as a browser does", () => {
  const { measure } = fontMeasure();
  assert.ok(inFile("latin", "24", 400, 11) < inFile("latin", "24", 400, 11, "latn"));
  near(measure("24", sans(400, 11)), inFile("latin", "24", 400, 11, "latn"));
  near(measure("^&", sans(400, 11)), inFile("latin", "^&", 400, 11, "latn"));
});

test("a weight sets the wght axis", () => {
  const { measure } = fontMeasure();
  for (const weight of [m.textWeight, m.edgeWeight, m.labelWeight])
    near(measure("Gateway", sans(weight, 12)), inFile("latin", "Gateway", weight, 12));
  assert.ok(measure("Gateway", sans(600, 12)) > measure("Gateway", sans(400, 12)));
});

test("widths scale linearly with size below Inter's smallest optical size", () => {
  const { measure } = fontMeasure();
  const perPixel = (size: number) => measure("Token cache (AV)", sans(500, size)) / size;
  near(perPixel(m.labelSize), perPixel(m.tabSize));
  near(perPixel(m.smallSize), perPixel(m.tabSize));
});

test("monospace text advances 0.6 em per character", () => {
  const { measure } = fontMeasure();
  near(measure("GET /orders", mono(12)), 11 * 0.6 * 12);
});

test("characters no font file has are estimated at 1 em and recorded", () => {
  const first = fontMeasure();
  const width = first.measure("A →漢😀", sans(400, 12));
  const covered = first.measure("A ", sans(400, 12));
  near(width, covered + 3 * 12);
  assert.deepEqual([...first.uncovered], ["→", "漢", "😀"]);

  const second = fontMeasure();
  second.measure("Plain", sans(400, 12));
  assert.deepEqual([...second.uncovered], []);
  second.measure("A →漢😀", sans(400, 12));
  assert.deepEqual([...second.uncovered], ["→", "漢", "😀"]);
});

test("a family without font files is an error", () => {
  const { measure } = fontMeasure();
  assert.throws(() => measure("x", { family: "Comic Sans MS", weight: 400, size: 12 }), /Comic/);
});

test("a diagram from the reference compiles with font measurement", () => {
  const { draw } = examples("diagrams.md")[0] ?? { draw: "" };
  const { measure, uncovered } = fontMeasure();
  const out = compileFigure(
    {
      draw: new Function("d", draw) as (d: DiagramBuilder) => void,
      steps: [],
      build: false,
    },
    { measure, icons: lucideIcons() },
  );
  assert.equal(out.ok, true);
  assert.deepEqual(out.diagnostics, []);
  assert.deepEqual([...uncovered], []);
  const api = out.nodes.find((n) => n.id === "api");
  assert.ok(api);
  const label = measure("API", sans(m.labelWeight, m.labelSize));
  assert.ok(label > 20 && label < 30, `API is ${label} wide`);
  assert.ok(api.rect.width >= label + 2 * m.padX);
});
