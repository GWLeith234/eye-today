import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

async function expectNoSeriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
}

test("home has no serious or critical axe violations", async ({ page }) => {
  await page.goto("/");
  await expectNoSeriousViolations(page);
});

test("newsletter, support and account have no serious or critical axe violations", async ({ page }) => {
  for (const path of ["/newsletter", "/support", "/account"]) {
    await page.goto(path);
    await expectNoSeriousViolations(page);
  }
});

test("a section and an article have no serious or critical axe violations when they exist", async ({ page }) => {
  await page.goto("/");
  const hrefs = await page.locator("a[href]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href") ?? ""));
  // Event and directory pages share the two-segment shape of a story; they are not stories.
  const article = hrefs.find((href) => /^\/[a-z0-9-]+\/[a-z0-9-]+$/.test(href) && !/^\/(events|directory|jobs|classifieds)\//.test(href));
  const staticPaths = new Set([
    "search", "newsletter", "newsletters", "support", "about", "contact", "advertise", "ad-policy",
    "write-for-us", "editorial-policy", "corrections", "disclaimer", "privacy", "terms", "login", "account",
    "directory", "events", "jobs", "classifieds",
  ]);
  const section = hrefs.find((href) => {
    const match = /^\/([a-z0-9-]+)$/.exec(href);
    return Boolean(match && !staticPaths.has(match[1]));
  });
  test.skip(!article && !section, "No published section or article on this site");
  if (section) {
    await page.goto(section);
    await expectNoSeriousViolations(page);
  }
  if (article) {
    await page.goto(article);
    await expectNoSeriousViolations(page);
  }
});
