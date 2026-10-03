import { expect, test } from "@playwright/test";

import { queryRows } from "../helpers/db";
import { e2eFull } from "../helpers/guard";
import { createTestUser, signInAs, uniqueId } from "../helpers/users";

const LANDING = "https://ads.e2e.example/landing";

test.describe("ad journey", () => {
  test.skip(!e2eFull(), "Needs E2E_FULL=1 on a seeded local Supabase (the e2e-full CI job).");

  test("campaign, approved creative, impression and click are recorded and reported", async ({ browser, baseURL, request }) => {
    test.setTimeout(120_000);
    const run = uniqueId();
    const advertiser = `E2E Advertiser ${run}`;
    const sponsorText = `E2E sponsor ${run}`;

    // The slot serves one creative at random, so earlier e2e campaigns (a retry, a reused database) must go.
    await queryRows("delete from public.ad_campaigns where advertiser_name like 'E2E Advertiser %'");

    const editor = await createTestUser("ads-editor", "editor");
    const desk = await (await browser.newContext({ baseURL })).newPage();
    await signInAs(desk, editor, "/admin/ads");

    let campaignUrl = "";
    await test.step("editor creates an active campaign", async () => {
      await desk.locator('input[name="advertiser_name"]').fill(advertiser);
      await desk.locator('input[name="name"]').fill(`Campaign ${run}`);
      await desk.locator('select[name="status"]').selectOption("active");
      await desk.getByRole("button", { name: "Create campaign" }).click();
      await expect(desk).toHaveURL(/\/admin\/ads\/[0-9a-f-]{36}$/);
      campaignUrl = desk.url();
    });

    await test.step("a new creative is pending and is not served", async () => {
      await desk.locator('select[name="slot_id"]').selectOption({ label: "Leaderboard (leaderboard)" });
      await desk.locator('input[name="click_url"]').fill(LANDING);
      await desk.locator('textarea[name="html"]').fill(`<p>${sponsorText} <a href="${LANDING}">Visit the sponsor</a></p>`);
      await desk.getByRole("button", { name: "Add creative" }).click();
      await expect(desk.getByRole("button", { name: "Approve" })).toBeVisible();

      const served = await (await request.get("/api/ads/serve?slot=leaderboard")).json();
      expect(served).toEqual({});
    });

    const [creative] = await queryRows<{ id: string; status: string }>(
      "select c.id, c.status from public.ad_creatives c join public.ad_campaigns g on g.id = c.campaign_id where g.advertiser_name = $1",
      [advertiser],
    );
    expect(creative?.status).toBe("pending");

    await test.step("approving it makes it serve", async () => {
      await desk.getByRole("button", { name: "Approve" }).click();
      await expect(desk.getByRole("button", { name: "Reject" })).toBeVisible();

      const served = (await (await request.get("/api/ads/serve?slot=leaderboard")).json()) as { creative?: { id: string; html: string | null } };
      expect(served.creative?.id).toBe(creative!.id);
      // Every link in the stored HTML is rewritten to the click route, never straight to the advertiser.
      expect(served.creative?.html).toContain(`/api/ads/click/${creative!.id}`);
      expect(served.creative?.html).not.toContain(LANDING);
    });

    const reader = await (await browser.newContext({ baseURL })).newPage();
    await reader.route("https://ads.e2e.example/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<h1>Sponsor landing</h1>" }));

    await test.step("a reader sees the ad and one impression is recorded", async () => {
      const impression = reader.waitForResponse((r) => r.url().endsWith("/api/ads/event") && r.request().method() === "POST");
      await reader.goto("/");
      const slot = reader.locator('aside[data-ad-slot="leaderboard"]');
      await expect(slot).toContainText(sponsorText);
      expect((await impression).status()).toBe(204);
      await expect
        .poll(async () => (await queryRows<{ n: string }>("select count(*) as n from public.ad_events where creative_id = $1 and event_type = 'impression'", [creative!.id]))[0]?.n)
        .toBe("1");
    });

    await test.step("clicking the ad records a click and lands on the advertiser", async () => {
      await reader.locator('aside[data-ad-slot="leaderboard"] a').click();
      await expect(reader).toHaveURL(LANDING);
      await expect
        .poll(async () => (await queryRows<{ n: string }>("select count(*) as n from public.ad_events where creative_id = $1 and event_type = 'click'", [creative!.id]))[0]?.n)
        .toBe("1");
    });

    await test.step("the campaign report and the CSV show them", async () => {
      await desk.goto(campaignUrl);
      await expect(desk.getByRole("region", { name: "Report" })).toContainText("1 impression · 1 click");

      const csv = await desk.request.get(`${campaignUrl}/report`);
      expect(csv.status()).toBe(200);
      const lines = (await csv.text()).trim().split("\n");
      expect(lines[0]).toBe("occurred_at,creative_id,slot,event_type");
      expect(lines.filter((l) => l.endsWith(`${creative!.id},leaderboard,impression`))).toHaveLength(1);
      expect(lines.filter((l) => l.endsWith(`${creative!.id},leaderboard,click`))).toHaveLength(1);
    });

    await test.step("a rejected creative stops serving and clicking", async () => {
      await desk.getByRole("button", { name: "Reject" }).click();
      await expect(desk.getByRole("button", { name: "Approve" })).toBeVisible();
      expect(await (await request.get("/api/ads/serve?slot=leaderboard")).json()).toEqual({});
      const click = await request.get(`/api/ads/click/${creative!.id}`, { maxRedirects: 0 });
      expect(click.status()).toBe(404);
    });
  });
});
