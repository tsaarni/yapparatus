import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { root } from "./workspace.ts";

test("a chart draws its block of data in theme colors, with a legend, and the page does not show the data", async ({
  page,
}) => {
  await page.goto("/charts");
  const chart = page.locator("figure", { hasText: "Figure 7.1" });
  const dots = chart.locator("svg [aria-label=dot] circle");
  await expect(dots).toHaveCount(6);
  // Categories take colors in the order the rows first use them.
  await expect(chart.getByRole("list", { name: "Legend" })).toHaveText(/Search\s*Checkout/);
  const colors = await dots.evaluateAll((all) => all.map((d) => d.getAttribute("fill")));
  expect(new Set(colors).size).toBe(2);
  expect(colors.every((c) => c?.startsWith("var("))).toBe(true);
  await expect(page.getByRole("list", { name: "Chart diagnostics" })).toHaveCount(0);
  await expect(chart).not.toContainText("2026-01,Search");
  await expect(chart.locator("pre, table")).toHaveCount(0);
});

test("a file's chart keeps its rows out of the page, and redraws when the file changes", async ({
  page,
  request,
}) => {
  // The page module refers to the data module and holds none of the rows.
  const module = await (await request.get("/content/charts.mdx")).text();
  expect(module).toContain("virtual:yapparatus/data:sample/throughput.csv");
  expect(module).not.toContain("8900");

  await page.goto("/charts");
  const chart = page.locator("figure", { hasText: "Figure 7.2" });
  const dots = chart.locator("svg [aria-label=dot] circle");
  await expect(dots).toHaveCount(6);
  const file = path.join(root, "source", "throughput.csv");
  const original = readFileSync(file, "utf8");
  try {
    writeFileSync(file, `${original}200,9900,after\n`);
    await expect(dots).toHaveCount(7);
    await expect(chart.getByRole("list", { name: "Chart diagnostics" })).toHaveCount(0);
  } finally {
    writeFileSync(file, original);
  }
  await expect(dots).toHaveCount(6);
});

test("a mark that names no column is reported under the chart, and the last drawing stays", async ({
  page,
}) => {
  const file = path.join(root, "content", "charts.mdx");
  const original = readFileSync(file, "utf8");
  try {
    await page.goto("/charts");
    const chart = page.locator("figure", { hasText: "Figure 7.2" });
    const dots = chart.locator("svg [aria-label=dot] circle");
    await expect(dots).toHaveCount(6);
    writeFileSync(file, original.replace('y: "rps"', 'y: "requests"'));
    const diagnostics = chart.getByRole("list", { name: "Chart diagnostics" });
    await expect(diagnostics).toContainText(
      'CHART_FIELD Plot.dot sets y: "requests", which is no column of its data. The columns are "connections", "rps", "build".',
    );
    await expect(dots).toHaveCount(6);
  } finally {
    writeFileSync(file, original);
  }
});

test("a chart draws a table on its page, and the table stays shown", async ({ page }) => {
  await page.goto("/charts");
  const table = page.locator("#requests");
  await table.scrollIntoViewIfNeeded();
  await expect(table.locator("table")).toBeVisible();
  const chart = page.locator("figure", { hasText: "Figure 7.4" });
  await expect(chart.locator("svg [aria-label=bar] rect")).toHaveCount(3);
  await expect(chart.getByRole("list", { name: "Chart diagnostics" })).toHaveCount(0);
});
