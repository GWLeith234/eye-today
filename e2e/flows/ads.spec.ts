import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { signIn } from "../helpers/auth";

test("an approved creative records an impression and a click", async ({ browser }) => {
  test.skip(process.env.E2E_FULL !== "1", "Needs a seeded local Supabase and a signed-in editor.");
  test.setTimeout(90_000);

  const editor = await signIn(browser, "editor");
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await admin.from("ad_campaigns").update({ status: "paused" }).eq("status", "active");
  const stamp = Date.now().toString(36);
  const name = `E2E campaign ${stamp}`;
  const sponsor = `E2E sponsor ${stamp}`;
  await editor.page.goto("/admin/ads");
  await editor.page.getByLabel("Advertiser name").fill("E2E Sponsor");
  await editor.page.getByLabel("Campaign name").fill(name);
  await editor.page.getByLabel("Status").selectOption("active");
  await editor.page.getByRole("button", { name: "Create campaign" }).click();
  await expect(editor.page).toHaveURL(/\/admin\/ads\/[0-9a-f-]{36}/i);
  const campaignId = new URL(editor.page.url()).pathname.split("/")[3];

  await editor.page.getByLabel("Slot").selectOption({ label: "Leaderboard (leaderboard)" });
  await editor.page.getByLabel("Click URL (https)").fill("https://example.com/e2e-sponsor");
  await editor.page.getByLabel("HTML instead of an image").fill(`<p><a href="https://example.com/e2e-sponsor">${sponsor}</a></p>`);
  await editor.page.getByRole("button", { name: "Add creative" }).click();
  await expect(editor.page.getByText("Saved (creative).")).toBeVisible();
  await editor.page.getByRole("button", { name: "Approve" }).click();
  await expect(editor.page.getByText("approved", { exact: true })).toBeVisible();

  const reader = await browser.newContext();
  const page = await reader.newPage();
  await page.goto("/");
  const link = page.getByRole("link", { name: sponsor });
  await expect(link).toBeVisible();
  await page.waitForTimeout(1500);
  const href = await link.getAttribute("href");
  expect(href).toMatch(/^\/api\/ads\/click\/[0-9a-f-]{36}$/i);
  const click = await page.request.get(href!, { maxRedirects: 0 });
  expect(click.status()).toBe(302);

  await expect
    .poll(async () => {
      const report = await editor.page.request.get(`/admin/ads/${campaignId}/report`);
      return report.ok() ? await report.text() : "";
    })
    .toMatch(/impression/);
  const csv = await (await editor.page.request.get(`/admin/ads/${campaignId}/report`)).text();
  expect(csv).toMatch(/click/);
  expect(csv.split("\n")[0]).toBe("occurred_at,creative_id,slot,event_type");

  await reader.close();
  await editor.page.context().close();
});
