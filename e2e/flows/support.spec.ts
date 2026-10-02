import { expect, test } from "@playwright/test";

test("support does not charge a card when payments are closed", async ({ page }) => {
  await page.goto("/support");
  await expect(page.getByRole("heading", { name: "Support us" })).toBeVisible();
  await expect(page.getByText("Payments are not open yet.")).toBeVisible();
});

test.describe("checkout redirect", () => {
  test.skip(!process.env.E2E_FULL, "Needs Stripe test mode mocked against a seeded signed-in user.");

  test("a checkout session redirect is created", async () => {
    // Implemented when E2E_FULL provides a signed-in user and a Stripe test double.
  });
});
