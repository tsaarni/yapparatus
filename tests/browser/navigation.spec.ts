import { expect, type Page, test } from "@playwright/test";

/** Follow an in-app link to `address`, as a link written in a page would. */
async function follow(page: Page, address: string) {
  await page.evaluate((href) => {
    const link = document.createElement("a");
    link.href = href;
    link.textContent = "Go";
    document.querySelector("main article")?.append(link);
    link.click();
  }, address);
}

const scrollTop = (page: Page) =>
  page.evaluate(() => document.querySelector("[data-scroll-root]")?.scrollTop ?? 0);

test("a page's code loads when it is opened, and its anchor is shown once it has", async ({
  page,
}) => {
  const requested: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes(".mdx")) requested.push(new URL(request.url()).pathname);
  });
  await page.goto("/first-page");
  await expect(page.getByRole("heading", { name: "First page", level: 1 })).toBeVisible();
  expect(requested.some((url) => url.endsWith("/diagrams.mdx"))).toBe(false);

  // The diagrams page loads slowly. Until it has loaded, the old page stays on screen.
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/content/diagrams.mdx*", async (route) => {
    await held;
    await route.continue();
  });
  await follow(page, "/diagrams#worker-states");
  await expect(page).toHaveURL(/\/diagrams#worker-states$/);
  await expect(page.getByRole("heading", { name: "First page", level: 1 })).toBeVisible();
  release();
  await expect(page.getByRole("heading", { name: "Diagram forms", level: 1 })).toBeVisible();
  await expect(page.locator("figure#worker-states")).toBeInViewport();
});

test("Back returns to the position on a page that was loaded when it was opened", async ({
  page,
}) => {
  await page.goto("/first-page");
  await follow(page, "/diagrams");
  await expect(page.getByRole("heading", { name: "Diagram forms", level: 1 })).toBeVisible();
  await page.locator("figure#tcp-header").scrollIntoViewIfNeeded();
  await page.evaluate(() =>
    document.querySelector("[data-scroll-root]")?.scrollBy({ top: 40, behavior: "instant" }),
  );
  const position = await scrollTop(page);
  expect(position).toBeGreaterThan(200);

  await follow(page, "/second-page");
  await expect(page.getByRole("heading", { name: "Second page", level: 1 })).toBeVisible();
  await expect.poll(() => scrollTop(page)).toBe(0);
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Diagram forms", level: 1 })).toBeVisible();
  await expect.poll(() => scrollTop(page)).toBe(position);
});
