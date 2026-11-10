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
import { apiPrefix } from "../../src/protocol.ts";
import { yapparatus } from "../../src/vite.ts";

let root: string;
let server: PreviewServer;
const privateSentinel = "PRIVATE_CHAT_SENTINEL_1703";

async function expectCompiledDiagram(page: Page) {
  const diagram = page.getByRole("img", { name: "Fixture flow." });
  await expect(diagram).toBeVisible();
  await expect(diagram.locator("[data-element-id=fixture-edge]")).toHaveCount(1);
  await expect(diagram.locator("[data-element-id=fixture-edge][role=button]")).toHaveCount(0);
  await expect(page.getByRole("list", { name: "Diagram diagnostics" })).toHaveCount(0);
}

test.beforeAll(async () => {
  root = mkdtempSync(path.join(os.tmpdir(), "yapparatus-build-"));
  for (const entry of ["src", "icons"]) cpSync(entry, path.join(root, entry), { recursive: true });
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
  await expect(page.getByRole("button", { name: "Ask", exact: true })).toHaveCount(0);
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
  for (const entry of readdirSync(path.join(root, "dist/content/-/assets"))) {
    const output = readFileSync(path.join(root, "dist/content/-/assets", entry), "utf8");
    expect(output).not.toContain(privateSentinel);
  }
  // Every page has its own file, so a deep link works on any static host.
  await page.goto("http://127.0.0.1:4174/second-page#details");
  await expect(page.getByRole("heading", { name: "Second page" })).toBeVisible();
  await expect(page.locator("h2#details")).toBeInViewport();
  expect(apiRequests).toEqual([]);
});

test("diagram steps: controls, build reveal, groups, step-only parts, and links", async ({
  page,
}) => {
  await page.goto("http://127.0.0.1:4174/second-page");
  const figure = page.locator("figure#step-flow");
  const part = (id: string) => figure.locator(`[data-element-id="${id}"]`);
  // Without a step, the whole figure shows except step-only parts.
  await expect(figure.getByText("3 steps")).toBeVisible();
  await expect(part("go")).toHaveAttribute("role", "button");
  await expect(part("finish")).toHaveCSS("opacity", "1");
  await expect(part("hint")).toHaveCSS("opacity", "0");
  await figure.getByRole("button", { name: "Start steps" }).click();
  await expect(figure.getByText("Everything begins here.")).toBeVisible();
  await expect(part("hint")).toHaveCSS("opacity", "1");
  await expect(part("finish")).toHaveCSS("opacity", "0");
  await figure.getByRole("button", { name: "Next step" }).click();
  await expect(part("hint")).toHaveCSS("opacity", "0");
  await expect(part("start")).toHaveCSS("opacity", "0.35");
  // A container focuses everything in it.
  await figure.getByRole("button", { name: "Next step" }).click();
  await expect(part("start")).toHaveAttribute("data-state", "focus");
  await expect(part("finish")).toHaveAttribute("data-state", "focus");
  // Clicking a part opens the next step about it, wrapping around.
  await part("start").click();
  await expect(figure.getByText("Step 1 of 3")).toBeVisible();
  await figure.getByRole("button", { name: "Show all" }).click();
  await expect(figure.getByText("3 steps")).toBeVisible();
  // Steps and parts have addresses.
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
  // A deep link works on a static host, and shows its lines.
  await page.goto("http://127.0.0.1:4174/-/files/sample/greet.ts#L2-L3");
  await expect(page.locator("[data-selected]")).toHaveCount(2);
  // Files whose names other plugins claim, such as JSON and CSS, are shown as text.
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
  // Source files open from the single file too.
  await page.goto(
    `${pathToFileURL(path.join(root, "dist-single/content/index.html")).href}#/-/files/sample/greet.ts#L2`,
  );
  await expect(page.locator("[data-selected]")).toHaveCount(1);
  // A file's chart loads its data from inside the single file.
  await page.goto(
    `${pathToFileURL(path.join(root, "dist-single/content/index.html")).href}#/charts`,
  );
  const chart = page.locator("figure", { hasText: "Figure 7.3" });
  await chart.scrollIntoViewIfNeeded();
  await expect(chart.locator("svg [aria-label=line]")).toHaveCount(1);
  expect(remoteRequests).toEqual([]);
  expect(readFileSync(path.join(root, "dist-single/content/index.html"), "utf8")).not.toContain(
    privateSentinel,
  );
});
