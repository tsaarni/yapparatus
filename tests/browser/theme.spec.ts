/**
 * The theme setting: auto follows the system and lets the reader choose; a fixed theme does not.
 * Diagram icons follow the theme in their label's color, or in their ink on an icon shape.
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { root } from "./workspace.ts";

const settingsFile = path.join(root, "content", "document.json");
const dark = "rgb(10, 12, 17)";
const light = "rgb(255, 255, 255)";

/**
 * Write the fixture's document.json while `page` shows the document, and wait for the reload
 * the dev server sends for the edit. Navigating before it arrives races with it.
 */
async function writeSettings(page: Page, text: string) {
  await page.goto("/");
  await expect(page.locator(".masthead")).toBeVisible();
  const reloaded = page.waitForEvent("load");
  writeFileSync(settingsFile, text);
  await reloaded;
  await expect(page.locator(".masthead")).toBeVisible();
}

/** Run with `theme` in the fixture's document.json, then restore it. */
async function withTheme(page: Page, theme: string, run: () => Promise<void>) {
  const original = readFileSync(settingsFile, "utf8");
  await writeSettings(page, JSON.stringify({ ...JSON.parse(original), theme }));
  try {
    await run();
  } finally {
    await writeSettings(page, original);
  }
}

const canvas = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
const colorScheme = (page: Page) =>
  page.locator('meta[name="color-scheme"]').getAttribute("content");

test("auto: the system decides, and the reader can choose light or dark", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await withTheme(page, "auto", async () => {
    await expect(page.locator(".theme-switch")).toHaveCount(1);
    expect(await colorScheme(page)).toBe("light dark");
    expect(await canvas(page)).toBe(dark);
    await page.emulateMedia({ colorScheme: "light" });
    await expect.poll(() => canvas(page)).toBe(light);

    const button = page.locator(".theme-switch");
    await expect(button).toHaveAccessibleName("Theme: System. Switch to Light");
    await button.click();
    await expect(button).toHaveAccessibleName("Theme: Light. Switch to Dark");
    await button.click();
    await expect(button).toHaveAccessibleName("Theme: Dark. Switch to System");
    expect(await canvas(page)).toBe(dark);

    await page.reload();
    await expect(button).toHaveAccessibleName("Theme: Dark. Switch to System");
    expect(await canvas(page)).toBe(dark);
    await button.click();
    await expect(button).toHaveAccessibleName("Theme: System. Switch to Light");
    expect(await canvas(page)).toBe(light);
  });
});

test("a fixed theme ignores the system and offers no choice", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await withTheme(page, "light", async () => {
    expect(await canvas(page)).toBe(light);
    expect(await colorScheme(page)).toBe("light");
    await expect(page.locator(".theme-switch")).toHaveCount(0);
  });
  await page.emulateMedia({ colorScheme: "light" });
  expect(await canvas(page)).toBe(dark);
  expect(await colorScheme(page)).toBe("dark");
  await expect(page.locator(".theme-switch")).toHaveCount(0);
});

/**
 * For the icon box and the icon shape of the report flow: the icon's color, its label's, and the
 * element's ink, read from a probe stroked as an actor's figure is.
 */
const iconColors = (page: Page) =>
  page.evaluate(() =>
    ["billing-workers", "analyst"].map((id) => {
      const element = document.querySelector(`figure#report-flow [data-element-id="${id}"]`);
      const stroke = element?.querySelector(":scope > svg [stroke]");
      const label = element?.querySelector(":scope > text");
      const probe = document.createElementNS("http://www.w3.org/2000/svg", "path");
      probe.style.stroke = "var(--ink)";
      element?.append(probe);
      const ink = getComputedStyle(probe).stroke;
      probe.remove();
      return {
        icon: stroke ? getComputedStyle(stroke).stroke : "none",
        label: label ? getComputedStyle(label).fill : "none",
        ink,
      };
    }),
  );

/** A box's icon has its label's color; an icon shape's has the element's ink, as an actor. */
async function expectIconColors(page: Page) {
  await page.goto("/diagrams");
  await expect(page.locator('figure#report-flow [data-element-id="analyst"] svg')).toBeVisible();
  const [box, shape] = await iconColors(page);
  expect(box?.icon).toBe(box?.label);
  expect(shape?.icon).toBe(shape?.ink);
  expect(shape?.icon).not.toBe(shape?.label);
  return box?.icon;
}

test("a diagram icon draws in its label's or its ink's color in both themes", async ({ page }) => {
  const inDark = await expectIconColors(page);
  await withTheme(page, "light", async () => {
    expect(await expectIconColors(page)).not.toBe(inDark);
  });
});
