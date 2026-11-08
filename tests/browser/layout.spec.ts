import { expect, test } from "@playwright/test";

test("reading layout: contents, text column, wide figures, and resized chat", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page).toHaveURL(/\/first-page$/);
  await page.evaluate(() => document.fonts.load('17px "Inter Variable"'));
  await expect(page.locator(".app")).toHaveAttribute("data-layout", "wide");

  // The header shows document.json's subtitle and logo; the tab shows its favicon and subtitle.
  const masthead = page.locator(".masthead");
  await expect(masthead.locator(".subtitle")).toHaveText("Fixture");
  await expect(masthead.locator(".logo svg")).toHaveAttribute("width", "28");
  await expect(page).toHaveTitle("First page · Fixture document · Fixture");
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute("href", /^data:image\/svg\+xml,/);

  // Contents show every chapter, with the current page's sections under it.
  const contents = page.getByRole("navigation", { name: "Pages" });
  await expect(contents.getByRole("link", { name: "1 First page" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(contents.getByRole("link", { name: "Wide figure" })).toBeVisible();

  // Numbering: chapter, sections, and figures; a Ref shows the current number.
  await expect(page.getByText("Chapter 1")).toBeVisible();
  await expect(page.locator("h2#wide-figure")).toContainText("1.2");
  await expect(page.locator("figure#wide-flow figcaption")).toContainText("Figure 1.2");
  await expect(page.getByRole("link", { name: "Figure 1.2" })).toHaveAttribute(
    "href",
    "/first-page#wide-flow",
  );
  await expect(page.getByRole("link", { name: "Chapter 2" })).toHaveAttribute(
    "href",
    "/second-page",
  );
  await expect(page.getByRole("link", { name: "Section 2.1" })).toHaveAttribute(
    "href",
    "/second-page#details",
  );

  // Tables count separately from figures, with the title above the table.
  const table = page.locator("figure#fixture-table");
  await expect(table.locator("figcaption")).toContainText("Table 1.1");
  expect(await table.evaluate((figure) => figure.firstElementChild?.tagName.toLowerCase())).toBe(
    "figcaption",
  );
  await expect(page.getByRole("link", { name: "Table 1.1" })).toHaveAttribute(
    "href",
    "/first-page#fixture-table",
  );

  // The text column keeps its reading width; a wide drawing keeps its natural size.
  const geometry = await page.evaluate(() => {
    const box = (selector: string) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(selector);
      return element.getBoundingClientRect();
    };
    const svg = document.querySelector<SVGSVGElement>("figure#wide-flow .figure-scroll > svg");
    return {
      paragraph: box("article [data-lead]").width,
      figure: box("figure#wide-flow").width,
      drawn: svg?.getBoundingClientRect().width ?? 0,
      natural: svg?.viewBox.baseVal.width ?? 0,
      overflow: document.documentElement.scrollWidth > window.innerWidth,
      code: box("main article pre").width,
      codeScrolls: (() => {
        const pre = document.querySelector("main article pre");
        return !!pre && pre.scrollWidth > pre.clientWidth;
      })(),
    };
  });
  expect(geometry.paragraph).toBeLessThanOrEqual(560);
  expect(geometry.figure).toBeGreaterThan(geometry.paragraph + 100);
  expect(geometry.drawn).toBeCloseTo(geometry.natural, 0);
  expect(geometry.overflow).toBe(false);
  // Code grows to fit its longest line instead of wrapping or scrolling.
  expect(geometry.code).toBeGreaterThan(geometry.paragraph);
  expect(geometry.codeScrolls).toBe(false);

  // Links by page name, file name, and anchor; Back returns to the previous page.
  await page.getByRole("link", { name: "its anchor" }).click();
  await expect(page).toHaveURL(/\/second-page#details$/);
  await expect(page.getByRole("heading", { name: "Second page" })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/first-page$/);
  await page.goto("/second-page#details");
  await expect(page.locator("h2#details")).toBeInViewport();
  await page.goto("/no-such-page");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await page.goto("/");

  // Selection menu stays below the title.
  await page.locator("article [data-lead]").evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
  });
  const menu = page.getByRole("toolbar", { name: "Selection actions" });
  await expect(menu).toBeVisible();
  const popup = await menu.boundingBox();
  const heading = await page.locator("article h1").boundingBox();
  expect(popup && heading && popup.y >= heading.y + heading.height).toBeTruthy();
  await page.keyboard.press("Escape");

  // The chat takes space from the page, and the page adapts.
  await page.locator(".masthead").getByRole("button", { name: "Ask", exact: true }).click();
  await page.locator(".chat").evaluate((element) => {
    (element as HTMLElement).style.width = "600px";
  });
  await expect(page.locator(".app")).toHaveAttribute("data-layout", "compact");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const reading = document.querySelector("main")?.getBoundingClientRect();
        const panel = document.querySelector(".chat")?.getBoundingClientRect();
        return !!reading && !!panel && reading.right <= panel.left;
      }),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Full width", exact: true }).click();
  await expect(page.locator(".chat")).toHaveCSS("width", "1440px");
  await page.getByRole("button", { name: "Return to page" }).click();
  await expect(page.locator(".chat")).toHaveCSS("width", "600px");
});

test("narrow reading keeps contents, typography, and menu inside viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".app")).toHaveAttribute("data-layout", "compact");
  await page.evaluate(() => document.fonts.load('17px "Inter Variable"'));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  const contents = page.getByRole("navigation", { name: "Pages" });
  await expect(contents).toHaveCount(0);
  await page.getByRole("button", { name: "Open contents" }).click();
  await expect(contents).toBeInViewport();
  await contents.getByRole("link", { name: "2 Second page" }).click();
  await expect(page.getByRole("heading", { name: "Second page" })).toBeVisible();
  await expect(contents).toHaveCount(0);
  await page.goto("/");

  // Reading type follows the reading column's width, not the window's.
  const fontSize = (selector: string) =>
    page
      .locator(selector)
      .evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  expect(await fontSize("article h1")).toBe(28);
  expect(await fontSize("article [data-lead]")).toBe(16);
  await page.locator("article [data-lead]").evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
  });
  const menu = page.getByRole("toolbar", { name: "Selection actions" });
  await expect(menu).toBeVisible();
  const popup = await menu.boundingBox();
  expect(
    popup &&
      popup.x >= 0 &&
      popup.x + popup.width <= 390 &&
      popup.y >= 0 &&
      popup.y + popup.height <= 844,
  ).toBeTruthy();
});

test("markdown conventions: alerts, marked code lines, and file trees", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/markdown");

  // An alert is a note with its kind as the title; a plain quote stays a quote.
  const alert = page.getByRole("note");
  await expect(alert).toHaveCount(1);
  await expect(alert).toContainText("Warning");
  await expect(alert).toContainText("Back up the database before you migrate.");
  await expect(alert).not.toContainText("[!WARNING]");
  await expect(page.locator("blockquote")).toHaveText("A plain quotation stays a quotation.");

  // Marked lines, with the notation removed; Copy leaves out the removed line.
  const code = page.locator("pre code");
  await expect(code.locator("[data-mark]")).toHaveCount(3);
  await expect(code).not.toContainText("[!code");
  await page.getByRole("button", { name: "Copy code" }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("retries: 5,");
  expect(copied).not.toContain("retries: 3,");

  // The file tree shows folders with a slash, the highlighted entry, and its comment.
  const tree = page.locator(".file-tree").first();
  await expect(tree).toContainText("src/");
  await expect(tree).toContainText("migrate.ts");
  await expect(tree).toContainText("runs the migration");
  await expect(tree).toContainText("package.json");
  await expect(tree).toHaveCSS("border-top-width", "1px");
  // Inside a figure, the figure draws the only frame.
  const framed = page.locator("#tree-figure .file-tree");
  await expect(framed).toContainText("guide.mdx");
  await expect(framed).toHaveCSS("border-top-width", "0px");
  await expect(framed).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
});

test("the reading column, not the window, sets the reading type", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto("/");
  const title = page.locator("article h1");
  await expect(title).toHaveCSS("font-size", "32px");
  await page.locator(".masthead").getByRole("button", { name: "Ask", exact: true }).click();
  await page.locator(".chat").evaluate((element) => {
    (element as HTMLElement).style.width = "700px";
  });
  await expect(title).toHaveCSS("font-size", "28px");
});

test("print shows the page alone, as dark ink on paper", async ({ page }) => {
  await page.goto("/");
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".masthead")).toBeHidden();
  await expect(page.getByRole("navigation", { name: "Pages" })).toBeHidden();
  await expect(page.locator("article h1")).toHaveCSS("color", "rgb(17, 20, 27)");
  await expect(page.locator("html")).toHaveCSS("background-color", "rgb(255, 255, 255)");
});

test("diagram categories: colors, a legend, and highlighting from the legend or a step", async ({
  page,
}) => {
  await page.goto("/categories");
  const figure = page.locator("figure#migration");
  const legend = figure.getByRole("list", { name: "Legend" });
  await expect(legend.getByRole("button")).toHaveText(["New", "To be removed"]);
  const part = (id: string) => figure.locator(`[data-element-id="${id}"]`);
  const ink = (id: string) =>
    part(id).evaluate((element) => getComputedStyle(element).getPropertyValue("--ink"));
  // Parts in one category share a color; parts without one stay neutral.
  expect(await ink("orders")).toBe(await ink("payments"));
  expect(await ink("orders")).not.toBe(await ink("batch-job"));
  expect(await ink("database")).not.toBe(await ink("orders"));

  // Pointing at a legend entry highlights its parts and fades the others.
  await legend.getByRole("button", { name: "To be removed" }).hover();
  await expect(part("batch-job")).toHaveAttribute("data-state", "focus");
  await expect(part("orders")).toHaveAttribute("data-state", "dim");
  await page.mouse.move(0, 0);
  await expect(part("orders")).not.toHaveAttribute("data-state");

  // A step focuses a whole category by its id.
  await figure.getByRole("button", { name: "Start steps" }).click();
  await expect(part("orders")).toHaveAttribute("data-state", "focus");
  await expect(part("payments")).toHaveAttribute("data-state", "focus");
  await expect(part("batch-job")).toHaveAttribute("data-state", "dim");
});
