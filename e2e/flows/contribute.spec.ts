import { expect, test } from "@playwright/test";

test("a signed-out contributor is sent to sign in", async ({ page }) => {
  await page.goto("/contribute");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Sign in to Eye Today" })).toBeVisible();
});

test.describe("editorial loop", () => {
  test.skip(!process.env.E2E_FULL, "Needs a seeded local Supabase and signed-in contributor and editor.");

  test("submit, request changes, resubmit and publish", async () => {
    // Implemented when E2E_FULL points this suite at a seeded stack. The CI job does not.
  });
});
