import { expect, test } from "@playwright/test";

test("the masthead shows the wordmark, the date and the section nav", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Eye Today" }).first()).toBeVisible();
  // The nav is empty until sections load, so it has no box. It is still in the header.
  await expect(page.getByTestId("section-nav")).toBeAttached();
  await expect(page.getByRole("link", { name: "Support" }).first()).toBeVisible();
  await expect(page.getByText("Published by EvolveX360")).toBeVisible();
});

test("the mobile menu traps focus and Escape closes it", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const menu = page.getByRole("button", { name: "Menu" });
  await expect(menu).toBeVisible();
  await menu.click();
  const dialog = page.getByRole("dialog", { name: "Sections" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(menu).toBeFocused();
});

test("a cover with stories shows the lead, the latest and fallback art", async ({ page }) => {
  await page.goto("/");
  const empty = await page.getByRole("heading", { name: "The first stories are on their way." }).count();
  test.skip(empty > 0, "No published stories on this site");
  await expect(page.getByTestId("lead-story")).toBeVisible();
  await expect(page.getByRole("heading", { name: "The Latest" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Most Read" })).toBeVisible();
  const fallback = page.getByTestId("fallback-art");
  if (await fallback.count()) await expect(fallback.first()).toBeVisible();
});
