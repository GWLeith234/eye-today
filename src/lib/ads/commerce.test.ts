import assert from "node:assert/strict";
import { test } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";

import { campaignPayable, runAdCheckout } from "./checkout";
import { pageTypeFromPath } from "./placements";
import { adCheckoutOffered, parseMonths } from "./prices";
import { breakdownCsv, breakdownTotals, ctr } from "./report";
import { handleAdEvent } from "./webhook";

const ENV = { STRIPE_SECRET_KEY: "sk_test", SITE_URL: "https://theeye.today/", STRIPE_PRICE_ROS_MONTHLY: "price_ros" };
const CAMPAIGN = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";

test("self-serve ads are offered only with the key, SITE_URL and the monthly price", () => {
  assert.equal(adCheckoutOffered(ENV), true);
  assert.equal(adCheckoutOffered({ ...ENV, STRIPE_PRICE_ROS_MONTHLY: " " }), false);
  assert.equal(adCheckoutOffered({ ...ENV, SITE_URL: undefined }), false);
});

test("months are whole numbers from 1 to 12", () => {
  assert.equal(parseMonths("3"), 3);
  assert.equal(parseMonths(12), 12);
  assert.equal(parseMonths("0"), null);
  assert.equal(parseMonths("13"), null);
  assert.equal(parseMonths("2.5"), null);
  assert.equal(parseMonths(""), null);
});

test("only an unpaid draft with a creative can be paid for", () => {
  assert.equal(campaignPayable({ status: "draft", paid_at: null, creatives: 1 }), null);
  assert.equal(campaignPayable({ status: "draft", paid_at: null, creatives: 0 }), "no_creatives");
  assert.equal(campaignPayable({ status: "draft", paid_at: "2026-10-01T00:00:00Z", creatives: 1 }), "not_payable");
  assert.equal(campaignPayable({ status: "pending", paid_at: "2026-10-01T00:00:00Z", creatives: 1 }), "not_payable");
  assert.equal(campaignPayable({ status: "active", paid_at: null, creatives: 1 }), "not_payable");
});

test("checkout charges the monthly price times the months with campaign metadata", async () => {
  let params: Stripe.Checkout.SessionCreateParams | null = null;
  const outcome = await runAdCheckout(
    {
      env: ENV,
      userId: USER,
      email: "clinic@example.com",
      campaignId: CAMPAIGN,
      loadCampaign: async () => ({ status: "draft", paid_at: null, creatives: 2 }),
      createSession: async (p) => {
        params = p;
        return "https://checkout.stripe.test/x";
      },
    },
    "3",
  );
  assert.deepEqual(outcome, { ok: true, url: "https://checkout.stripe.test/x" });
  const p = params as unknown as Stripe.Checkout.SessionCreateParams;
  assert.equal(p.mode, "payment");
  assert.deepEqual(p.line_items, [{ price: "price_ros", quantity: 3 }]);
  assert.deepEqual(p.metadata, { kind: "ad_campaign", campaign_id: CAMPAIGN, profile_id: USER, months: "3" });
  assert.equal(p.success_url, `https://theeye.today/account/advertise/${CAMPAIGN}?paid=1`);
});

test("checkout refuses bad input without calling Stripe", async () => {
  const deps = {
    env: ENV,
    userId: USER,
    email: null,
    campaignId: CAMPAIGN,
    loadCampaign: async () => ({ status: "draft", paid_at: null, creatives: 0 }),
    createSession: async () => {
      throw new Error("should not be called");
    },
  };
  assert.deepEqual(await runAdCheckout(deps, "40"), { ok: false, error: "invalid_months" });
  assert.deepEqual(await runAdCheckout(deps, "2"), { ok: false, error: "no_creatives" });
  assert.deepEqual(await runAdCheckout({ ...deps, loadCampaign: async () => null }, "2"), { ok: false, error: "not_yours" });
  assert.deepEqual(await runAdCheckout({ ...deps, env: {} }, "2"), { ok: false, error: "not_configured" });
});

function fakeDb(result: { data?: unknown; error?: { code: string } | null }) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const db = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      return { data: result.data ?? null, error: result.error ?? null };
    },
  } as unknown as SupabaseClient;
  return { db, calls };
}

const session = (over: Partial<Stripe.Checkout.Session> = {}): Stripe.Event =>
  ({
    id: "evt_1",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_1",
        mode: "payment",
        payment_status: "paid",
        amount_total: 75000,
        currency: "usd",
        metadata: { kind: "ad_campaign", campaign_id: CAMPAIGN, profile_id: USER, months: "3" },
        ...over,
      },
    },
  }) as unknown as Stripe.Event;

test("the webhook applies a paid ad checkout once and ignores everything else", async () => {
  const { db, calls } = fakeDb({ data: "pending" });
  const outcomes: string[] = [];
  assert.equal(await handleAdEvent(db, session(), (o) => outcomes.push(o)), true);
  assert.deepEqual(calls[0], {
    fn: "apply_ad_payment",
    args: { p_session: "cs_1", p_campaign: CAMPAIGN, p_profile: USER, p_months: 3, p_amount: 75000, p_currency: "usd" },
  });
  assert.deepEqual(outcomes, ["pending"]);

  assert.equal(await handleAdEvent(db, session({ metadata: { kind: "posting" } })), false, "a posting checkout is not ours");
  assert.equal(await handleAdEvent(db, session({ payment_status: "unpaid" }), (o) => outcomes.push(o)), true);
  assert.equal(outcomes.at(-1), "ignored");
  assert.equal(calls.length, 1, "nothing else reached the database");
});

test("a database failure throws so the route lets Stripe retry", async () => {
  const { db } = fakeDb({ error: { code: "42501" } });
  await assert.rejects(handleAdEvent(db, session()), /ad payment failed \(42501\)/);
});

test("the breakdown totals, CTR and CSV", () => {
  const rows = [
    { slot_key: "leaderboard", page_type: "home", impressions: 200, clicks: 3 },
    { slot_key: "bigbox-1", page_type: "article", impressions: 0, clicks: 0 },
  ];
  assert.deepEqual(breakdownTotals(rows), { impressions: 200, clicks: 3 });
  assert.equal(ctr(200, 3), "1.50%");
  assert.equal(ctr(0, 0), "–");
  assert.equal(breakdownCsv(rows), "slot,page_type,impressions,clicks,ctr\nleaderboard,home,200,3,1.50%\nbigbox-1,article,0,0,–\n");
});

test("the mobile banner labels its page from the path", () => {
  assert.equal(pageTypeFromPath("/"), "home");
  assert.equal(pageTypeFromPath("/news"), "section");
  assert.equal(pageTypeFromPath("/news/some-story"), "article");
  assert.equal(pageTypeFromPath("/directory/listing/x"), "directory");
  assert.equal(pageTypeFromPath("/events"), "events");
  assert.equal(pageTypeFromPath("/jobs/x"), "jobs");
  assert.equal(pageTypeFromPath("/editions/2026-10"), "editions");
  assert.equal(pageTypeFromPath("/about"), "other");
  assert.equal(pageTypeFromPath("/account/advertise"), "other");
  assert.equal(pageTypeFromPath(null), "home");
});
