/**
 * The font measure in src/compiler/font-measure.ts gives the web app's canvas widths. The browser
 * runs without font hinting: with it, Linux Chromium rounds each glyph advance to a whole pixel.
 */
import { expect, test } from "@playwright/test";
import { fontMeasure } from "../../src/compiler/font-measure.ts";
import { lucideIcons } from "../../src/compiler/lucide-icons.ts";
import { DiagramBuilder } from "../../src/diagram/builder.ts";
import { compile } from "../../src/diagram/compile/compile.ts";
import { type FontSpec, type Measure, defaultMetrics as m } from "../../src/diagram/metrics.ts";
import { Scene } from "../../src/diagram/scene.ts";
import { examplePages, examples } from "../unit/diagram/examples.ts";

test.use({ launchOptions: { args: ["--font-render-hinting=none"] } });

/** Every font the compiler measures with: the sans weights at each size, and mono. */
const fonts: FontSpec[] = [m.labelSize, m.smallSize, m.tabSize].flatMap((size) => [
  ...[m.textWeight, m.edgeWeight, m.labelWeight].map((weight) => ({
    family: m.sans,
    weight,
    size,
  })),
  { family: m.mono, weight: m.textWeight, size },
]);

const hard = [
  "AV",
  "To",
  "Ty",
  "WAVE Tyrant Võ",
  "0123456789",
  "24",
  "1,024",
  "^&",
  "10.0.0.1:443",
  "1,024 × 768 px; 3.14 (~ 22/7)",
  "!?.,:;'\"()[]{}<>/\\|@#$%^&*-_+=~`",
  "“quoted” — ‘single’ … – end",
  "α-β Ωmega Σigma Δ",
  "Привет мир Жук",
  "fi fl ffi office",
  "-> => <= != ==",
  "The gateway forwards each authenticated request to the order service, which writes it to the database",
  "x".repeat(120),
];

/** The texts the compiler measures in the diagram reference, with their fonts. */
function referenceTexts(): Array<{ text: string; font: FontSpec }> {
  const found = new Map<string, { text: string; font: FontSpec }>();
  for (const page of examplePages)
    for (const { draw } of examples(page)) {
      const scene = new Scene();
      const d = new DiagramBuilder(scene);
      new Function("d", draw)(d);
      const measure: Measure = (text, font) => {
        found.set(`${font.family}|${font.weight}|${font.size}|${text}`, { text, font });
        return text.length * 7;
      };
      compile(scene, { measure, icons: lucideIcons() });
    }
  return [...found.values()];
}

test("font file widths match the web app's canvas measurement", async ({ page }) => {
  const corpus = [
    ...referenceTexts(),
    ...fonts.flatMap((font) => hard.map((text) => ({ text, font }))),
  ];
  const arrow = fonts.map((font) => ({ text: "client → server", font }));

  await page.goto("/");
  const canvas = await page.evaluate(
    async (items) => {
      const context = document.createElement("canvas").getContext("2d");
      if (!context) throw new Error("no canvas");
      const css = ({ font }: (typeof items)[number]) =>
        `${font.weight} ${font.size}px ${font.family}`;
      await Promise.all(items.map((item) => document.fonts.load(css(item), item.text)));
      await document.fonts.ready;
      return items.map((item) => {
        context.font = css(item);
        return context.measureText(item.text).width;
      });
    },
    [...corpus, ...arrow],
  );

  const compare = ({ text, font }: { text: string; font: FontSpec }, width: number, i: number) => {
    const family = font.family === m.mono ? "mono" : "sans";
    const diff = width - (canvas[i] ?? Number.NaN);
    return {
      diff,
      label: `${diff.toFixed(3)} px, ${family} ${font.weight} ${font.size}px ${JSON.stringify(text)}`,
    };
  };

  const { measure, uncovered } = fontMeasure();
  const rows = corpus.map((item, i) => compare(item, measure(item.text, item.font), i));
  expect([...uncovered]).toEqual([]);
  const largest = rows.reduce((a, b) => (Math.abs(b.diff) > Math.abs(a.diff) ? b : a));
  console.log(`${rows.length} texts; largest difference ${largest.label}`);
  expect(rows.filter((row) => !(Math.abs(row.diff) < 0.5)).map((row) => row.label)).toEqual([]);

  const estimated = fontMeasure();
  for (const [i, item] of arrow.entries()) {
    const row = compare(item, estimated.measure(item.text, item.font), corpus.length + i);
    console.log(`estimated: ${row.label}`);
  }
  expect([...estimated.uncovered]).toEqual(["→"]);
});
