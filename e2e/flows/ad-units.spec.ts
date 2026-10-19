import { expect, test } from "@playwright/test";
import Stripe from "stripe";

import { adminClient, parkPaidCampaignsOn } from "../helpers/admin";
import { signIn } from "../helpers/auth";
import { readStripeSessions } from "../helpers/mailbox";
import { solidPng } from "../helpers/png";

// Sprint 20 / 24: every page type carries ad units and a house ad fills any unit with no paid creative. The
// billboard is the top unit on desktop (Sprint 24); the leaderboard is the band between sections on the cover.
test("house ads fill the units on every page type", async ({ page }) => {
  test.skip(process.env.E2E_FULL !== "1", "Needs the seeded local Supabase with the house campaign.");
  for (const path of ["/", "/news", "/news/welcome-to-eye-today", "/directory", "/events", "/jobs", "/editions"]) {
    await page.goto(path);
    const billboard = page.locator('[data-ad-slot="billboard"]');
    await expect(billboard, path).toBeVisible();
    await expect(billboard.getByRole("img"), `${path} billboard is the house artwork`).toHaveAttribute("src", /\/house-ads\/billboard-970x250\.png$/);
    if (path === "/") {
      await expect(page.locator('[data-ad-slot="leaderboard"]'), "leaderboard band on the cover").toBeVisible();
      await expect(page.locator('[data-ad-slot="half-page"]'), "half page on the cover").toBeVisible();
    }
    // There is no house skin: the takeover is sold or absent, never filled.
    await expect(page.locator('[data-ad-slot="skin"]'), `${path} has no skin`).toHaveCount(0);
    await expect(page.locator("[data-ad-house='1']").first(), `${path} shows a house ad`).toBeAttached();
  }
  // The mobile banner is for phones only.
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/");
  const banner = page.locator('[data-ad-slot="mobile-banner"]');
  await expect(banner).toBeVisible();
  await banner.getByRole("button", { name: "Close advertisement" }).click();
  await expect(banner).toHaveCount(0);
});

// Definition of done: a clinic signs in → Advertise → names the campaign, uploads a creative, pays (Stripe
// double + signed webhook) → pending → an editor approves → it serves on the site → the clinic sees the count.
test("an advertiser buys a run-of-site campaign, an editor approves it, and it serves and reports", async ({ page, browser }) => {
  test.skip(process.env.E2E_FULL !== "1", "Needs the in-process Stripe double, a seeded local Supabase and editor and reader sessions.");
  test.setTimeout(150_000);

  const stamp = Date.now().toString(36);
  const name = `E2E Spring ${stamp}`;
  const alt = `E2E creative ${stamp}`;
  const admin = adminClient();
  // The big box: ads.spec.ts runs alongside and sells the leaderboard, so this campaign takes a unit nobody else
  // uses. Paid big-box campaigns left by earlier runs would share the rotation, so park those (and only those).
  await parkPaidCampaignsOn(admin, "bigbox-1");

  const clinic = await signIn(browser, "reader");
  await clinic.page.goto("/account/advertise");
  await clinic.page.getByLabel("Advertiser").fill("E2E Clinic");
  await clinic.page.getByLabel("Campaign name (for you)").fill(name);
  await clinic.page.getByLabel("Click URL (https)").fill("https://example.com/e2e-campaign");
  await clinic.page.getByRole("button", { name: "Create campaign" }).click();
  await expect(clinic.page).toHaveURL(/\/account\/advertise\/[0-9a-f-]{36}\?saved=campaign/i);
  const campaignId = new URL(clinic.page.url()).pathname.split("/")[3];
  await expect(clinic.page.getByTestId("campaign-status")).toHaveText("Draft (not paid)");

  await test.step("a wrong-size image is refused; the right size is stored pending", async () => {
    await clinic.page.getByLabel("Unit").selectOption("bigbox-1");
    await clinic.page.getByLabel("Image").setInputFiles({ name: "wrong.png", mimeType: "image/png", buffer: solidPng(300, 200) });
    await clinic.page.getByLabel("What it says (alt text)").fill(alt);
    await clinic.page.getByRole("button", { name: "Upload creative" }).click();
    // Next's route announcer is also role=alert, so match the message itself.
    await expect(clinic.page.getByText("not 300 × 250 pixels")).toBeVisible();

    await clinic.page.getByLabel("Unit").selectOption("bigbox-1");
    await clinic.page.getByLabel("Image").setInputFiles({ name: "right.png", mimeType: "image/png", buffer: solidPng(300, 250) });
    await clinic.page.getByLabel("What it says (alt text)").fill(alt);
    await clinic.page.getByRole("button", { name: "Upload creative" }).click();
    await expect(clinic.page.getByRole("status")).toContainText("Creative uploaded");
    await expect(clinic.page.getByTestId("own-creative")).toHaveCount(1);
    await expect(clinic.page.getByTestId("own-creative").getByRole("img")).toHaveAttribute("alt", alt);
  });

  await test.step("checkout charges the monthly price three times", async () => {
    await clinic.page.route("https://checkout.stripe.test/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<h1>Checkout</h1>" }));
    await clinic.page.locator('select[name="months"]').selectOption("3");
    await clinic.page.getByRole("button", { name: "Pay with card" }).click();
    await expect(clinic.page).toHaveURL(/checkout\.stripe\.test\/e2e-session/);
    const session = readStripeSessions().reverse().find((line) => line.price === process.env.STRIPE_PRICE_ROS_MONTHLY);
    expect(session?.mode).toBe("payment");
    expect(session?.quantity).toBe(3);
  });

  const secret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
  const payload = JSON.stringify({
    id: `evt_e2e_ad_${stamp}`,
    object: "event",
    api_version: "2024-06-20",
    created: Math.floor(Date.now() / 1000),
    type: "checkout.session.completed",
    data: {
      object: {
        id: `cs_e2e_ad_${stamp}`,
        object: "checkout.session",
        payment_status: "paid",
        mode: "payment",
        amount_total: 75000,
        currency: "usd",
        client_reference_id: clinic.id,
        metadata: { kind: "ad_campaign", campaign_id: campaignId, profile_id: clinic.id, months: "3" },
      },
    },
  });
  await test.step("the paid webhook moves the campaign to pending once; a replay changes nothing", async () => {
    const post = () =>
      clinic.page.request.post("/api/webhooks/stripe", {
        data: payload,
        headers: { "stripe-signature": Stripe.webhooks.generateTestHeaderString({ payload, secret }), "content-type": "application/json" },
      });
    const first = await post();
    expect(first.status(), await first.text()).toBe(200);
    const replay = await post();
    expect(await replay.json()).toEqual({ ok: true, duplicate: true });
    const { data } = await admin.from("ad_campaigns").select("status, months, paid_at, starts_at, ends_at").eq("id", campaignId).single();
    expect(data?.status).toBe("pending");
    expect(data?.months).toBe(3);
    expect(data?.paid_at).toBeTruthy();
    expect(new Date(data!.ends_at).getTime() - new Date(data!.starts_at).getTime()).toBeGreaterThan(85 * 86_400_000);
    await clinic.page.goto(`/account/advertise/${campaignId}`);
    await expect(clinic.page.getByTestId("campaign-status")).toHaveText("Paid · waiting for an editor");
  });

  // Not serving yet: the big box on the home page is still the house ad.
  await page.goto("/");
  await expect(page.locator('[data-ad-slot="bigbox-1"]')).toHaveAttribute("data-ad-house", "1");

  const editor = await signIn(browser, "editor");
  await test.step("the editor finds it in the queue and approves it", async () => {
    await editor.page.goto("/admin/ads");
    await expect(editor.page.getByRole("region", { name: /awaiting approval/i }).getByRole("link", { name })).toBeVisible();
    await editor.page.goto(`/admin/ads/${campaignId}`);
    await editor.page.getByRole("button", { name: "Approve campaign" }).click();
    await expect(editor.page.getByRole("status")).toContainText("Saved (approved)");
    const { data } = await admin.from("ad_campaigns").select("status").eq("id", campaignId).single();
    expect(data?.status).toBe("active");
    const { data: creatives } = await admin.from("ad_creatives").select("status").eq("campaign_id", campaignId);
    expect(creatives).toEqual([{ status: "approved" }]);
  });

  await test.step("the creative serves on the home page and a click is counted on the home page type", async () => {
    await page.goto("/");
    const image = page.locator('[data-ad-slot="bigbox-1"]').getByRole("img", { name: alt });
    await expect(image).toBeVisible();
    await image.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1500);
    const href = await image.locator("xpath=..").getAttribute("href");
    expect(href).toMatch(/^\/api\/ads\/click\/[0-9a-f-]{36}\?page=home$/i);
    const click = await page.request.get(href!, { maxRedirects: 0 });
    expect(click.status()).toBe(302);
    expect(click.headers().location).toBe("https://example.com/e2e-campaign");
  });

  await test.step("the advertiser sees the breakdown and downloads it", async () => {
    await expect
      .poll(async () => {
        const csv = await clinic.page.request.get(`/account/advertise/${campaignId}/report`);
        return csv.ok() ? await csv.text() : "";
      })
      .toMatch(/^slot,page_type,impressions,clicks,ctr\nbigbox-1,home,\d+,1,/);
    await clinic.page.goto(`/account/advertise/${campaignId}`);
    await expect(clinic.page.getByTestId("campaign-status")).toHaveText("Live");
    await expect(clinic.page.getByRole("region", { name: "Report" }).getByRole("row").filter({ hasText: "bigbox-1" })).toContainText("home");
    // Another signed-in user cannot read it (the e2e reader is one fixed account, so use the contributor).
    const other = await signIn(browser, "contributor");
    const denied = await other.page.request.get(`/account/advertise/${campaignId}/report`);
    expect(denied.status()).toBe(404);
    await other.page.context().close();
  });

  await admin.from("ad_campaigns").update({ status: "ended" }).eq("id", campaignId);
  await clinic.page.context().close();
  await editor.page.context().close();
});
