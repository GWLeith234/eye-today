import { expect, test } from "@playwright/test";

test("a reader can open the front page and search", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Eye Today" }).first()).toBeVisible();
  const hrefs = await page.locator("main a[href]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href") ?? ""));
  const article = hrefs.find((href) => /^\/[a-z0-9-]+\/[a-z0-9-]+$/.test(href) && !/^\/(events|directory|jobs|classifieds)\//.test(href));
  if (article) {
    await page.goto(article);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const section = `/${article.split("/")[1]}`;
    await page.goto(section);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
  await page.goto("/search?q=ibogaine");
  await expect(page.getByRole("heading", { name: "Search" })).toBeVisible();
});
