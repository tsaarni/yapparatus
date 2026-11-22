/** Icons from the project's assets: an edit to the SVG file reaches the open page. */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { root } from "./workspace.ts";

test("an edited asset reaches the open page", async ({ page }) => {
  const file = path.join(root, "assets", "gateway.svg");
  const original = readFileSync(file, "utf8");
  await page.goto("/icons");
  const gateway = page.getByRole("img", { name: "Gateway" });
  await expect(gateway.locator("circle")).toHaveCount(0);
  try {
    writeFileSync(file, original.replace("</svg>", '<circle cx="12" cy="12" r="1"/></svg>'));
    await expect(gateway.locator("circle")).toHaveCount(1);
  } finally {
    writeFileSync(file, original);
  }
  await expect(gateway.locator("circle")).toHaveCount(0);
});
