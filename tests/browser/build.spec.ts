/** Static and single-file builds: reading without the chat, steps, source files, and chart data. */

import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { expect, type Page, test } from "@playwright/test";
import { build, type PreviewServer, preview } from "vite";
import { apiPrefix } from "../../src/protocol/rest-api.ts";
import { yapparatus } from "../../src/vite/plugin.ts";

let root: string;
let server: PreviewServer;
const privateSentinel = "PRIVATE_CHAT_SENTINEL_1703";

/** The fixture diagram is drawn from its compiled form, with no links and no diagnostics. */
async function expectCompiledDiagram(page: Page) {
  const diagram = page.getByRole("img", { name: "Fixture flow." });
  await expect(diagram).toBeVisible();
  await expect(diagram.locator("[data-element-id=fixture-edge]")).toHaveCount(1);
  await expect(diagram.locator("[data-element-id=fixture-edge][role=button]")).toHaveCount(0);
  await expect(page.getByRole("list", { name: "Diagram diagnostics" })).toHaveCount(0);
}

test.beforeAll(async () => {
  root = mkdtempSync(path.join(os.tmpdir(), "yapparatus-build-"));
  for (const entry of ["src", "assets"]) cpSync(entry, path.join(root, entry), { recursive: true });
  cpSync("tests/fixtures/content", path.join(root, "content"), { recursive: true });
  cpSync("tests/fixtures/source", path.join(root, "source"), { recursive: true });
  symlinkSync(path.resolve("node_modules"), path.join(root, "node_modules"), "dir");
  mkdirSync(path.join(root, ".yapparatus/content/chat"), { recursive: true });
  writeFileSync(path.join(root, ".yapparatus/content/chat/private.mdx"), `# ${privateSentinel}`);
  writeFileSync(
    path.join(root, ".yapparatus/content/chat.jsonl"),
    `${JSON.stringify({ seq: 1, author: "reader", text: privateSentinel })}\n`,
  );
  await build({
    root,
    configFile: false,
    logLevel: "error",
    plugins: yapparatus({ document: "content" }),
  });
  await build({
    root,
    configFile: false,
    logLevel: "error",
    plugins: yapparatus({ document: "content", singleFile: true }),
  });
  server = await preview({
    root,
    configFile: false,
    logLevel: "error",
    plugins: yapparatus({ document: "content" }),
    preview: { host: "127.0.0.1", port: 4174, strictPort: true },
  });
});
test.afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.httpServer.close((error) => (error ? reject(error) : resolve())),
  );
  rmSync(root, { recursive: true, force: true });
});

test("static reading retains navigation without the chat or its records", async ({ page }) => {
  const apiRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith(apiPrefix)) apiRequests.push(request.url());
  });
  await page.goto("http://127.0.0.1:4174");
  await expect(page).toHaveURL(/\/first-page$/);
  await page.evaluate(() => document.fonts.load('17px "Inter Variable"'));
  expect(await page.evaluate(() => document.fonts.check('17px "Inter Variable"'))).toBe(true);
  await expect(page.getByRole("heading", { name: "First page" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Chat", exact: true })).toHaveCount(0);
  await expect(page.getByRole("toolbar", { name: "Selection actions" })).toHaveCount(0);
  await expect(page.locator("figure").first()).toBeVisible();
  await expectCompiledDiagram(page);
  await page.getByRole("link", { name: "2 Second page" }).click();
  await expect(page).toHaveURL(/\/second-page$/);
  await expect(page.getByRole("heading", { name: "Second page" })).toBeVisible();
  await page.getByRole("link", { name: "3 Icons" }).click();
  await expect(page.getByRole("heading", { name: "Icons" })).toBeVisible();
  for (const label of ["Database", "Redis", "Battery", "Gateway"]) {
    await expect(page.getByRole("img", { name: label, exact: true })).toBeVisible();
  }
  await expect(page.getByRole("img", { name: "Redis", exact: true })).toHaveCSS("width", "28px");
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Second page" })).toBeVisible();
  for (const entry of readdirSync(path.join(root, "dist/content/-/assets"))) {
    const output = readFileSync(path.join(root, "dist/content/-/assets", entry), "utf8");
    expect(output).not.toContain(privateSentinel);
  }
  const preloads = (file: string) =>
    [
      ...readFileSync(path.join(root, "dist/content", file), "utf8").matchAll(
        /rel="modulepreload"[^>]*href="\/-\/assets\/([^"]+)"/g,
      ),
    ].map((match) => match[1] ?? "");
  expect(preloads("index.html")).toEqual([expect.stringMatching(/^first-page-.*\.js$/)]);
  expect(preloads("second-page/index.html")).toEqual([
    expect.stringMatching(/^second-page-.*\.js$/),
  ]);
  expect(preloads("404.html")).toEqual([]);
  for (const file of [...preloads("index.html"), ...preloads("second-page/index.html")])
    expect(readdirSync(path.join(root, "dist/content/-/assets"))).toContain(file);
  await page.goto("http://127.0.0.1:4174/second-page#details");
  await expect(page.getByRole("heading", { name: "Second page" })).toBeVisible();
  await expect(page.locator("h2#details")).toBeInViewport();
  expect(apiRequests).toEqual([]);
});

test("diagram steps: controls, build reveal, groups, step-only elements, and links", async ({
  page,
}) => {
  await page.goto("http://127.0.0.1:4174/second-page");
  const figure = page.locator("figure#step-flow");
  const element = (id: string) => figure.locator(`[data-element-id="${id}"]`);
  await expect(figure.getByText("3 steps")).toBeVisible();
  await expect(element("go")).toHaveAttribute("role", "button");
  await expect(element("finish")).toHaveCSS("opacity", "1");
  await expect(element("hint")).toHaveCSS("opacity", "0");
  await figure.getByRole("button", { name: "Start steps" }).click();
  await expect(figure.getByText("Everything begins here.")).toBeVisible();
  await expect(element("hint")).toHaveCSS("opacity", "1");
  await expect(element("finish")).toHaveCSS("opacity", "0");
  await figure.getByRole("button", { name: "Next step" }).click();
  await expect(element("hint")).toHaveCSS("opacity", "0");
  await expect(element("start")).toHaveCSS("opacity", "0.35");
  await figure.getByRole("button", { name: "Next step" }).click();
  await expect(element("start")).toHaveAttribute("data-state", "focus");
  await expect(element("finish")).toHaveAttribute("data-state", "focus");
  await element("start").click();
  await expect(figure.getByText("Step 1 of 3")).toBeVisible();
  await figure.getByRole("button", { name: "Show all" }).click();
  await expect(figure.getByText("3 steps")).toBeVisible();
  await page.goto("http://127.0.0.1:4174/second-page#step-flow--end");
  await expect(figure.getByText("Then it moves on.")).toBeVisible();
  await page.goto("http://127.0.0.1:4174/second-page#step-flow--hint");
  await expect(figure.getByText("Everything begins here.")).toBeVisible();
});

test("a build carries the source files its pages name, and only those", async ({ page }) => {
  await page.goto("http://127.0.0.1:4174/source-code");
  const excerpt = page.locator("[data-file='/-/files/sample/greet.ts']");
  await expect(excerpt.locator("[data-line]")).toHaveCount(4);
  await excerpt.getByRole("link", { name: "sample/greet.ts:1–4" }).click();
  await expect(page).toHaveURL(/\/-\/files\/sample\/greet\.ts$/);
  await expect(page.locator("main article [data-file] [data-line]")).toHaveCount(4);
  await page.goto("http://127.0.0.1:4174/-/files/sample/greet.ts#L2-L3");
  await expect(page.locator("[data-selected]")).toHaveCount(2);
  await page.goto("http://127.0.0.1:4174/-/files/sample/settings.json");
  await expect(page.locator("main article [data-file]")).toContainText('"greeting": "Hello"');
  await page.goto("http://127.0.0.1:4174/-/files/sample/greeting.css");
  await expect(page.locator("main article [data-file]")).toContainText("color: teal;");
  await page.goto("http://127.0.0.1:4174/-/files/sample/unnamed.txt");
  await expect(page.getByRole("alert")).toContainText("does not include it");
  const built = readdirSync(path.join(root, "dist/content/-/assets")).map((entry) =>
    readFileSync(path.join(root, "dist/content/-/assets", entry), "utf8"),
  );
  expect(built.some((output) => output.includes("no page names it"))).toBe(false);
});

test("a file's chart loads its data from its own asset when it nears the screen", async ({
  page,
}) => {
  const assets = readdirSync(path.join(root, "dist/content/-/assets"));
  const data = assets.filter((entry) => {
    const output = readFileSync(path.join(root, "dist/content/-/assets", entry), "utf8");
    return /\\?"name\\?":\\?"minute\\?"/.test(output) && output.includes("JSON.parse");
  });
  expect(data).toHaveLength(1);
  const requested: string[] = [];
  page.on("request", (request) => requested.push(new URL(request.url()).pathname));
  await page.setViewportSize({ width: 1280, height: 400 });
  await page.goto("http://127.0.0.1:4174/charts");
  const first = page.locator("figure", { hasText: "Figure 7.1" });
  await expect(first.locator("svg [aria-label=dot] circle")).toHaveCount(6);
  const chart = page.locator("figure", { hasText: "Figure 7.3" });
  expect(requested.some((p) => p.endsWith(data[0] as string))).toBe(false);
  await chart.scrollIntoViewIfNeeded();
  await expect(chart.locator("svg [aria-label=line]")).toHaveCount(1);
  expect(requested.some((p) => p.endsWith(data[0] as string))).toBe(true);
});

test("single HTML works from disk without external assets", async ({ page }) => {
  const remoteRequests: string[] = [];
  page.on("request", (request) => {
    if (/^https?:/.test(request.url())) remoteRequests.push(request.url());
  });
  await page.goto(pathToFileURL(path.join(root, "dist-single/content/index.html")).href);
  await page.evaluate(() => document.fonts.load('17px "Inter Variable"'));
  expect(await page.evaluate(() => document.fonts.check('17px "Inter Variable"'))).toBe(true);
  await expect(page.getByRole("heading", { name: "First page" })).toBeVisible();
  await expectCompiledDiagram(page);
  await page.getByRole("link", { name: "2 Second page" }).click();
  await expect(page).toHaveURL(/#\/second-page$/);
  await expect(page.getByRole("heading", { name: "Second page" })).toBeVisible();
  await page.getByRole("link", { name: "3 Icons" }).click();
  await expect(page.getByRole("heading", { name: "Icons" })).toBeVisible();
  for (const label of ["Database", "Redis", "Battery", "Gateway"]) {
    await expect(page.getByRole("img", { name: label, exact: true })).toBeVisible();
  }
  await expect(page.getByRole("img", { name: "Redis", exact: true })).toHaveCSS("width", "28px");
  await page.goto(
    `${pathToFileURL(path.join(root, "dist-single/content/index.html")).href}#/-/files/sample/greet.ts#L2`,
  );
  await expect(page.locator("[data-selected]")).toHaveCount(1);
  await page.goto(
    `${pathToFileURL(path.join(root, "dist-single/content/index.html")).href}#/charts`,
  );
  const chart = page.locator("figure", { hasText: "Figure 7.3" });
  await chart.scrollIntoViewIfNeeded();
  await expect(chart.locator("svg [aria-label=line]")).toHaveCount(1);
  expect(remoteRequests).toEqual([]);
  expect(readdirSync(path.join(root, "dist-single/content"), { recursive: true })).toEqual([
    "index.html",
  ]);
  expect(readFileSync(path.join(root, "dist-single/content/index.html"), "utf8")).not.toContain(
    privateSentinel,
  );
});
