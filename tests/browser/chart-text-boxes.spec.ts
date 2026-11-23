/**
 * Chart label boxes computed from attributes match the boxes Chromium lays out: two-line date
 * ticks, rotated ticks, a band y axis, and facets, drawn by Plot without a browser.
 */
import * as Plot from "@observablehq/plot";
import { expect, test } from "@playwright/test";
import { parseHTML } from "linkedom";
import { type ChartFont, textBox } from "../../src/chart/text-box.ts";
import { fontExtent, fontMeasure } from "../../src/compiler/font-measure.ts";

test.use({ launchOptions: { args: ["--font-render-hinting=none"] } });

const family = "Inter Variable";
const font: ChartFont = { family, size: 12, weight: 400, ...fontExtent(family) };
const { measure, uncovered } = fontMeasure();

const days = Array.from({ length: 31 }, (_, i) => ({
  Day: new Date(Date.UTC(2026, 9, i + 1)),
  Deploys: (i * 7) % 11,
}));
const projects = ["data-warehouse-ingestion-pipeline", "api", "frontend-web-app", "billing"].map(
  (Project, i) => ({ Project, Minutes: 10 + i * 13, Team: i % 2 ? "b" : "platform-team" }),
);

/** Charts drawn by Plot in a document without a browser, as the page compiler draws them. */
function drawings(): string[] {
  const { document } = parseHTML("<!doctype html><html><body></body></html>");
  const style = { fontFamily: `"${family}"`, fontSize: "12px" };
  const specs: Plot.PlotOptions[] = [
    { marks: [Plot.barY(days, { x: "Day", y: "Deploys" })], y: { grid: true } },
    { marks: [Plot.barY(projects, { x: "Project", y: "Minutes" })], x: { tickRotate: -30 } },
    { marks: [Plot.boxX(projects, { y: "Team", x: "Minutes" })] },
    { marks: [Plot.barY(projects, { fx: "Team", x: "Project", y: "Minutes" })] },
  ];
  return specs.map((spec) => {
    const options = { ...spec, width: 900, style, document } as Plot.PlotOptions;
    return (Plot.plot(options) as unknown as Element).outerHTML;
  });
}

test("label boxes from attributes are within a pixel of Chromium's", async ({ page }) => {
  await page.goto("/charts");
  for (const html of drawings()) {
    const rects = await page.evaluate(async (markup) => {
      const host = document.createElement("div");
      host.innerHTML = markup;
      document.body.append(host);
      await document.fonts.load(`12px "Inter Variable"`);
      const svg = host.querySelector("svg") as SVGSVGElement;
      const frame = svg.getBoundingClientRect();
      const boxes = [...svg.querySelectorAll("text")].map((text) => {
        const r = text.getBoundingClientRect();
        return [r.left - frame.left, r.top - frame.top, r.right - frame.left, r.bottom - frame.top];
      });
      host.remove();
      return boxes;
    }, html);
    const { document } = parseHTML(`<html><body>${html}</body></html>`);
    const texts = [...document.querySelectorAll("text")] as unknown as Element[];
    expect(texts.length).toBe(rects.length);
    texts.forEach((text, i) => {
      uncovered.clear();
      const box = textBox(text, font, measure);
      if (!box || uncovered.size || text.textContent?.startsWith("⚠")) return;
      const [left, top, right, bottom] = rects[i] as number[];
      const off = Math.max(
        Math.abs(box.left - (left as number)),
        Math.abs(box.top - (top as number)),
        Math.abs(box.right - (right as number)),
        Math.abs(box.bottom - (bottom as number)),
      );
      expect(off, `"${text.textContent}"`).toBeLessThan(1);
    });
  }
});
