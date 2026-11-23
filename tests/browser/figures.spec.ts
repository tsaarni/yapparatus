/**
 * Pictures from /-/api/figures: diagrams and charts, PNG size, element ids, errors, and pictures
 * after edits.
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { root, runCommand } from "./workspace.ts";

/** A PNG's size in pixels, from its header. */
function pngSize(data: Buffer) {
  expect(data.subarray(1, 4).toString()).toBe("PNG");
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

test("a diagram's picture is a PNG at twice the drawing's size", async ({ page, request }) => {
  const response = await request.get("/-/api/figures/first-page/fixture-flow");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("image/png");
  const size = pngSize(await response.body());
  await page.goto("/first-page");
  const viewBox = await page.locator("#fixture-flow svg[data-diagram]").getAttribute("viewBox");
  const [, , width = 0, height = 0] = (viewBox ?? "").split(" ").map(Number);
  expect(size).toEqual({ width: Math.round(width * 2), height: Math.round(height * 2) });
});

test("a chart's picture is a PNG of its drawing, from a block or a file", async ({ request }) => {
  for (const id of ["latency", "throughput"]) {
    const response = await request.get(`/-/api/figures/charts/${id}`);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("image/png");
    expect(pngSize(await response.body()).width).toBeGreaterThan(0);
  }
});

test("ids label the elements", async ({ request }) => {
  const get = async (query: string) =>
    (await request.get(`/-/api/figures/second-page/step-flow${query}`)).body();
  const whole = await get("");
  const ids = await get("?ids=true");
  expect(ids.equals(whole)).toBe(false);
  expect(pngSize(ids)).toEqual(pngSize(whole));
});

test("a picture that cannot be drawn answers with what to do", async ({ request }) => {
  const error = async (address: string, status: number) => {
    const response = await request.get(`/-/api/figures/${address}`);
    expect(response.status()).toBe(status);
    expect(response.headers()["content-type"]).toBe("application/json");
    return ((await response.json()) as { error: string }).error;
  };
  expect(await error("charts/latency?ids=true", 400)).toContain(
    "/charts#latency is a chart, and ids label the elements of a diagram.",
  );
  expect(await error("second-page/nothing", 404)).toContain(
    "The diagrams and charts with an id on its page: step-flow.",
  );
  expect(await error("no-such-page/flow", 404)).toContain("There is no page /no-such-page");
  expect(await error("second-page/step-flow?ids=yes", 400)).toContain("true or false");
});

test("the picture is of the page as it is on disk, right after an edit", async ({ request }) => {
  const file = path.join(root, "content", "panels.mdx");
  const original = readFileSync(file, "utf8");
  try {
    expect((await request.get("/-/api/figures/panels/added-now")).status()).toBe(404);
    writeFileSync(
      file,
      `${original}\n<Diagram id="added-now" draw={(d) => {\n  d.box("New")\n}} />\n`,
    );
    expect((await request.get("/-/api/figures/panels/added-now")).status()).toBe(200);
  } finally {
    writeFileSync(file, original);
  }
});

test("the agent saves a picture in the file it names", async () => {
  const file = path.join(root, "step-flow.png");
  const saved = await runCommand(
    `import { savePicture } from "yapparatus/agent"; await savePicture("/second-page#step-flow", ${JSON.stringify(file)});`,
  );
  expect(saved.stderr).toBe("");
  expect(pngSize(readFileSync(file)).width).toBeGreaterThan(0);
  const chart = path.join(root, "latency.png");
  const drawn = await runCommand(
    `import { savePicture } from "yapparatus/agent"; await savePicture("/charts#latency", ${JSON.stringify(chart)});`,
  );
  expect(drawn.stderr).toBe("");
  expect(pngSize(readFileSync(chart)).width).toBeGreaterThan(0);
  const failed = await runCommand(
    'import { savePicture } from "yapparatus/agent"; await savePicture("/charts#latency", "chart.png", { ids: true });',
  );
  expect(failed.code).toBe(1);
  expect(failed.stderr.trim()).toBe(
    "/charts#latency is a chart, and ids label the elements of a diagram. Ask again without ids.",
  );
});
