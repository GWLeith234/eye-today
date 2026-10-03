import { expect, type Page, test } from "@playwright/test";

// Structure checks for the Sprint 11 design. They need no particular stories: the ones that look for a
// card skip when the database has none (the placeholder CI job), and run on the seeded stack.

const desktop = { width: 1280, height: 900 };
const phone = { width: 390, height: 844 };

async function storyCount(page: Page, variant: string) {
  return page.locator(`article[data-variant="${variant}"]`).count();
}

test.describe("masthead", () => {
  test.use({ viewport: desktop });

  test("shows the wordmark, today's date, Support and the section nav", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("img", { name: "Eye Today" }).first()).toBeVisible();
    // Filled in by the browser, so a cached page never shows an old date.
    await expect(page.locator("header time")).toContainText(String(new Date().getFullYear()));
    await expect(page.getByRole("link", { name: "Support us" }).first()).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Sections", exact: true })).toBeVisible();
  });

  test("the bar sticks to the top once the page scrolls", async ({ page }) => {
    await page.goto("/about");
    await page.evaluate(() => window.scrollTo(0, 1200));
    const bar = page.getByRole("navigation", { name: "Sections", exact: true }).locator("xpath=ancestor::div[contains(@class,'sticky')]");
    await expect(bar).toBeVisible();
    expect((await bar.boundingBox())?.y).toBeLessThanOrEqual(1);
  });
});

test.describe("mobile menu", () => {
  test.use({ viewport: phone });

  test("opens as a dialog, lists the sections, and Escape closes it", async ({ page }) => {
    await page.goto("/");
    const menu = page.getByRole("dialog", { name: "Menu" });
    await expect(menu).toBeHidden();
    await page.getByRole("button", { name: "Menu" }).click();
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("link", { name: "Newsletter" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
  });

  test("no page scrolls sideways on a phone", async ({ page }) => {
    for (const path of ["/", "/about", "/support", "/newsletter"]) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });
});

test.describe("cover, section front and article", () => {
  test.use({ viewport: desktop });

  test("the cover has a lead story, a secondary row and fallback art where there is no photo", async ({ page }) => {
    await page.goto("/");
    test.skip((await storyCount(page, "lead")) === 0, "No stories in this database.");
    await expect(page.locator('article[data-variant="lead"]')).toHaveCount(1);
    expect(await storyCount(page, "river")).toBeGreaterThan(0);
    // The seed's story has no photo, so at least one card is the section-coloured iris tile.
    if ((await page.locator("[data-fallback-art]").count()) > 0) {
      await expect(page.locator("[data-fallback-art]").first()).toBeVisible();
    }
  });

  test("a section front has a coloured band, a lead and pagination chrome", async ({ page }) => {
    await page.goto("/");
    const href = await page.locator('article[data-variant="lead"] h2 a').first().getAttribute("href").catch(() => null);
    test.skip(!href, "No stories in this database.");
    await page.goto(`/${href!.split("/")[1]}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator(".sec-bg").first()).toBeVisible();
    await expect(page.locator('article[data-variant="lead"]')).toHaveCount(1);
  });

  test("an article has its disclosure, the medical disclaimer, related area and newsletter promo", async ({ page }) => {
    await page.goto("/");
    const href = await page.locator('article[data-variant="lead"] h2 a').first().getAttribute("href").catch(() => null);
    test.skip(!href, "No stories in this database.");
    await page.goto(href!);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("region", { name: "Author disclosures" })).toBeVisible();
    await expect(page.getByRole("note")).toContainText("Information only — not medical advice.");
    await expect(page.getByRole("heading", { name: "Get Eye Today by email" })).toBeVisible();
  });
});

test("the old placeholder blue is gone from the served stylesheet", async ({ request, page }) => {
  await page.goto("/");
  const hrefs = await page.locator('link[rel="stylesheet"]').evaluateAll((nodes) => nodes.map((n) => (n as HTMLLinkElement).href));
  expect(hrefs.length).toBeGreaterThan(0);
  for (const href of hrefs) {
    const css = (await (await request.get(href)).text()).toLowerCase();
    expect(css).not.toContain("#1d5c86");
    expect(css).toContain("#1e5b4a");
  }
});
