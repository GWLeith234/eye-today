import { expect, test } from "@playwright/test";

import { sha256Hex, unsubscribeToken } from "../../src/lib/newsletter/tokens";
import { waitForMail } from "../helpers/mailbox";

test("newsletter signup does not send mail when email is not configured", async ({ page }) => {
  test.skip(process.env.EMAIL_PROVIDER === "mock", "The mock mailbox is configured for the full suite.");
  await page.goto("/newsletter");
  await page.locator("main").getByLabel("Daily Brief").check();
  await page.locator("main").getByLabel("Email address").fill("reader@example.com");
  await page.locator("main").getByRole("button", { name: "Subscribe" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("Email is not configured.");
});

test("double opt-in then one-click unsubscribe", async ({ page }) => {
  test.skip(process.env.E2E_FULL !== "1" || process.env.EMAIL_PROVIDER !== "mock", "Needs the mock mailbox and a seeded database.");
  test.setTimeout(90_000);

  const email = `e2e-news-${Date.now().toString(36)}@example.com`;
  await page.goto("/newsletter");
  await page.locator("main").getByLabel("Daily Brief").check();
  await page.locator("main").getByLabel("Email address").fill(email);
  await page.locator("main").getByRole("button", { name: "Subscribe" }).click();
  await expect(page.locator("main").getByRole("status")).toContainText("Check your email to confirm.");

  const message = await waitForMail(email, "/newsletter/confirm?t=");
  const token = `${message.text}\n${message.html ?? ""}`.match(/\/newsletter\/confirm\?t=([A-Za-z0-9_-]+)/)?.[1];
  expect(token).toBeTruthy();

  await page.goto(`/newsletter/confirm?t=${token}`);
  await page.getByRole("button", { name: "Confirm my subscription" }).click();
  await expect(page.getByRole("heading", { name: "You're subscribed" })).toBeVisible();

  const secret = process.env.NEWSLETTER_LINK_SECRET ?? "";
  const unsubscribe = unsubscribeToken(secret, sha256Hex(token!));
  await page.goto(`/newsletter/unsubscribe?t=${unsubscribe.raw}`);
  await page.getByRole("button", { name: "Unsubscribe" }).click();
  await expect(page.getByRole("heading", { name: "You're unsubscribed" })).toBeVisible();
});
