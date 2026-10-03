import { expect, test } from "@playwright/test";

import { e2eFull } from "../helpers/guard";
import { createTestUser, signInAs } from "../helpers/users";

test("a reader can open the front page and search", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Eye Today" }).first()).toBeVisible();
  const hrefs = await page.locator("main a[href]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href") ?? ""));
  const article = hrefs.find((href) => /^\/[a-z0-9-]+\/[a-z0-9-]+$/.test(href));
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

test.describe("reader journey on the seeded database", () => {
  test.skip(!e2eFull(), "Needs E2E_FULL=1 on a seeded local Supabase (the e2e-full CI job).");

  test("the seeded story is on the front page, its section and its own page", async ({ page, request }) => {
    expect((await request.get("/api/health")).status()).toBe(200);

    await page.goto("/");
    const link = page.locator('main a[href="/news/welcome-to-eye-today"]').first();
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/news\/welcome-to-eye-today$/);
    await expect(page.getByRole("heading", { level: 1, name: "Welcome to Eye Today" })).toBeVisible();
    await expect(page.getByText("Information only — not medical advice.")).toBeVisible();

    await page.goto("/news");
    await expect(page.locator('a[href="/news/welcome-to-eye-today"]').first()).toBeVisible();
  });

  test("a signed-in reader reaches their account but is kept out of the contributor desk and the admin", async ({ page }) => {
    const reader = await createTestUser("reader", "reader");
    await signInAs(page, reader, "/account");
    await expect(page).toHaveURL(/\/account$/);

    await page.goto("/contribute");
    await expect(page).toHaveURL(/\/account$/);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/account$/);
  });
});
