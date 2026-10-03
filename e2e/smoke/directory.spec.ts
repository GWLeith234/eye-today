import { expect, test } from "@playwright/test";

test.describe.configure({ timeout: 45_000 });

test("directory pages carry the disclaimer", async ({ page }) => {
  await page.goto("/directory");
  await expect(page.getByRole("heading", { name: "Directory" })).toBeVisible();
  await expect(page.getByRole("search")).toBeVisible();
  await expect(page.getByRole("note")).toContainText("Information only — not medical advice.");

  await page.goto("/directory/how-we-verify");
  await expect(page.getByRole("heading", { name: "How we verify" })).toBeVisible();
  await expect(page.getByText("Draft for editorial review.", { exact: true })).toBeVisible();
  await expect(page.getByText("draft-for-editorial-review")).toHaveCount(0);
  await expect(page.getByRole("note")).toContainText("Information only — not medical advice.");

  await page.goto("/directory/submit");
  await expect(page.getByRole("heading", { name: "Add a listing" })).toBeVisible();
});

test("directory search fits a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/directory");
  const search = page.getByRole("search");
  await expect(search).toBeVisible();
  const box = await search.boundingBox();
  expect(box?.width ?? 0).toBeLessThanOrEqual(390);
  expect(box?.x ?? 0).toBeGreaterThanOrEqual(0);
});

test("a listing page shows the medical disclaimer", async ({ page }) => {
  const response = await page.goto("/directory/listing/zed-clinic");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Zed Clinic" })).toBeVisible();
  await expect(page.getByRole("note")).toContainText("Information only — not medical advice.");
});

test("an unknown listing or country code is a 404", async ({ page }) => {
  expect((await page.goto("/directory/listing/not-a-real-listing"))?.status()).toBe(404);
  expect((await page.goto("/directory/not-a-country"))?.status()).toBe(404);
});
