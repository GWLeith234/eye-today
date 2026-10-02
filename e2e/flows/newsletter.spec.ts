import { expect, test } from "@playwright/test";

// CI leaves Resend unset, so signup cannot send. There is no EMAIL_PROVIDER switch in the app.
test("newsletter signup does not send mail when email is not configured", async ({ page }) => {
  await page.goto("/newsletter");
  await page.locator("main").getByLabel("Daily Brief").check();
  await page.locator("main").getByLabel("Email address").fill("reader@example.com");
  await page.locator("main").getByRole("button", { name: "Subscribe" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("Email is not configured.");
});
