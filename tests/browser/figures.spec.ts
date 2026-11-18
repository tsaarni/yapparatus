import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { root, runSnippet } from "./workspace.ts";

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
  // The reader draws the same drawing: its view box is the picture's size in units.
  await page.goto("/first-page");
  const viewBox = await page.locator("#fixture-flow svg[data-diagram]").getAttribute("viewBox");
  const [, , width = 0, height = 0] = (viewBox ?? "").split(" ").map(Number);
  expect(size).toEqual({ width: Math.round(width * 2), height: Math.round(height * 2) });
});

test("ids label the parts", async ({ request }) => {
  const get = async (query: string) =>
    (await request.get(`/-/api/figures/second-page/step-flow${query}`)).body();
  const whole = await get("");
  const ids = await get("?ids=true");
  expect(ids.equals(whole)).toBe(false);
  // The same figure, the same size, whatever it shows.
  expect(pngSize(ids)).toEqual(pngSize(whole));
});

test("a picture that cannot be drawn answers with what to do", async ({ request }) => {
  const error = async (address: string, status: number) => {
    const response = await request.get(`/-/api/figures/${address}`);
    expect(response.status()).toBe(status);
    expect(response.headers()["content-type"]).toBe("application/json");
    return ((await response.json()) as { error: string }).error;
  };
  expect(await error("charts/latency", 404)).toContain("/charts#latency is a chart");
  expect(await error("second-page/nothing", 404)).toContain(
    "The diagrams with an id on its page: step-flow.",
  );
  expect(await error("no-such-page/flow", 404)).toContain("There is no page /no-such-page");
  expect(await error("second-page/step-flow?ids=yes", 400)).toContain("true or false");
});

test("the picture is of the page as it is on disk, right after an edit", async ({ request }) => {
  const file = path.join(root, "content", "panels.mdx");
  const original = readFileSync(file, "utf8");
  try {
    // Compiled once, without the figure.
    expect((await request.get("/-/api/figures/panels/added-now")).status()).toBe(404);
    writeFileSync(
      file,
      `${original}\n<Diagram id="added-now" draw={(d) => {\n  d.box("New")\n}} />\n`,
    );
    // No wait for the file watcher: the server compiles the page it finds changed.
    expect((await request.get("/-/api/figures/panels/added-now")).status()).toBe(200);
  } finally {
    writeFileSync(file, original);
  }
});

test("the agent saves a picture in the file it names", async () => {
  const file = path.join(root, "step-flow.png");
  const saved = await runSnippet(
    `import { savePicture } from "yapparatus/agent"; await savePicture("/second-page#step-flow", ${JSON.stringify(file)});`,
  );
  expect(saved.stderr).toBe("");
  expect(pngSize(readFileSync(file)).width).toBeGreaterThan(0);
  // An address that is not a diagram fails with the server's words alone.
  const failed = await runSnippet(
    'import { savePicture } from "yapparatus/agent"; await savePicture("/charts#latency", "chart.png");',
  );
  expect(failed.code).toBe(1);
  expect(failed.stderr.trim()).toBe(
    "/charts#latency is a chart, and only diagrams have pictures. A browser checks a chart when it shows the page.",
  );
});
