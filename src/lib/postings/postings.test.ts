import assert from "node:assert/strict";
import { test } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";

import { payable, runPostingCheckout } from "./checkout";
import { parsePostingForm } from "./form";
import { jobPostingJsonLd } from "./jsonld";
import { postingCheckoutOffered } from "./prices";
import { parsePostingFilters, postingsHref, salaryText } from "./query";
import type { PostingDetail } from "./types";
import { handlePostingEvent } from "./webhook";

const ENV = { STRIPE_SECRET_KEY: "sk_test", SITE_URL: "https://eyetoday.test/", STRIPE_PRICE_POSTING_30: "price_30", STRIPE_PRICE_POSTING_60: "price_60" };
const POSTING = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";

test("paid posting is offered only with the key, SITE_URL and both prices", () => {
  assert.equal(postingCheckoutOffered(ENV), true);
  assert.equal(postingCheckoutOffered({ ...ENV, STRIPE_PRICE_POSTING_60: " " }), false);
  assert.equal(postingCheckoutOffered({ ...ENV, SITE_URL: "" }), false);
});

test("checkout is a one-time payment for the chosen price with posting metadata", async () => {
  let params: Stripe.Checkout.SessionCreateParams | null = null;
  const outcome = await runPostingCheckout(
    {
      env: ENV,
      userId: USER,
      email: "a@example.com",
      postingId: POSTING,
      loadPosting: async () => ({ status: "draft", paid_days: 0, expires_at: null }),
      createSession: async (p) => {
        params = p;
        return "https://checkout.stripe.test/x";
      },
    },
    "60",
  );
  assert.deepEqual(outcome, { ok: true, url: "https://checkout.stripe.test/x" });
  assert.ok(params);
  const p = params as Stripe.Checkout.SessionCreateParams;
  assert.equal(p.mode, "payment");
  assert.deepEqual(p.line_items, [{ price: "price_60", quantity: 1 }]);
  assert.deepEqual(p.metadata, { kind: "posting", posting_id: POSTING, profile_id: USER, days: "60" });
  assert.equal(p.success_url, "https://eyetoday.test/account/postings?paid=1");
});

test("checkout refuses bad input without calling Stripe", async () => {
  const deps = {
    env: ENV,
    userId: USER,
    email: null,
    postingId: POSTING,
    loadPosting: async () => ({ status: "pending", paid_days: 30, expires_at: null }),
    createSession: async () => {
      throw new Error("should not be called");
    },
  };
  assert.deepEqual(await runPostingCheckout(deps, "45"), { ok: false, error: "invalid_duration" });
  assert.deepEqual(await runPostingCheckout(deps, "30"), { ok: false, error: "not_payable" });
  assert.deepEqual(await runPostingCheckout({ ...deps, loadPosting: async () => null }, "30"), { ok: false, error: "not_yours" });
  assert.deepEqual(await runPostingCheckout({ ...deps, env: {} }, "30"), { ok: false, error: "not_configured" });
  const now = Date.parse("2026-10-10T00:00:00Z");
  assert.equal(payable({ status: "expired", paid_days: 0, expires_at: "2026-09-01T00:00:00Z" }, now), true);
  assert.equal(payable({ status: "pending", paid_days: 30, expires_at: null }, now), false, "paid and waiting");
  assert.equal(payable({ status: "rejected", paid_days: 30, expires_at: null }, now), false, "rejected but already paid");
  assert.equal(payable({ status: "rejected", paid_days: 0, expires_at: null }, now), true, "rejected and never paid");
  assert.equal(payable({ status: "rejected", paid_days: 0, expires_at: "2026-11-01T00:00:00Z" }, now), false, "rejected while live, time left");
  assert.equal(payable({ status: "pending", paid_days: 0, expires_at: "2026-11-01T00:00:00Z" }, now), false, "edited live posting, clock running");
  assert.equal(payable({ status: "pending", paid_days: 0, expires_at: "2026-10-01T00:00:00Z" }, now), true, "edited, then its time ran out");
});

function fakeDb(result: { data: unknown; error: { code?: string } | null }) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const db = { rpc: async (name: string, args: Record<string, unknown>) => (calls.push({ name, args }), result) } as unknown as SupabaseClient;
  return { db, calls };
}

function completed(overrides: Partial<Stripe.Checkout.Session> = {}, metadata: Record<string, string> = {}): Stripe.Event {
  return {
    id: "evt_1",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_1",
        mode: "payment",
        payment_status: "paid",
        amount_total: 4900,
        currency: "usd",
        payment_intent: "pi_1",
        metadata: { kind: "posting", posting_id: POSTING, profile_id: USER, days: "30", ...metadata },
        ...overrides,
      },
    },
  } as unknown as Stripe.Event;
}

test("a paid posting checkout is applied once through the database function", async () => {
  const { db, calls } = fakeDb({ data: "pending", error: null });
  let seen = "";
  assert.equal(await handlePostingEvent(db, completed(), (o) => (seen = o)), true);
  assert.equal(seen, "pending");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "apply_posting_payment");
  assert.deepEqual(calls[0].args, {
    p_session: "cs_1",
    p_posting: POSTING,
    p_profile: USER,
    p_days: 30,
    p_amount: 4900,
    p_currency: "usd",
    p_payment_intent: "pi_1",
  });
});

test("other checkouts are left for the membership handler; unpaid or bad metadata changes nothing", async () => {
  const { db, calls } = fakeDb({ data: "pending", error: null });
  assert.equal(await handlePostingEvent(db, completed({}, { kind: "directory_feature" })), false);
  assert.equal(await handlePostingEvent(db, { ...completed(), type: "invoice.paid" } as Stripe.Event), false);
  assert.equal(await handlePostingEvent(db, completed({ payment_status: "unpaid" })), true);
  assert.equal(await handlePostingEvent(db, completed({}, { days: "45" })), true);
  assert.equal(await handlePostingEvent(db, completed({}, { posting_id: "nope" })), true);
  assert.equal(calls.length, 0);
});

test("a database failure throws so Stripe retries", async () => {
  const { db } = fakeDb({ data: null, error: { code: "57014" } });
  await assert.rejects(handlePostingEvent(db, completed()), /posting payment failed \(57014\)/);
});

const JOB: PostingDetail = {
  id: "j",
  slug: "nurse",
  title: "Night Nurse",
  organisation: "Clinic A",
  location: "Tulum",
  country_code: "MX",
  remote: "onsite",
  employment_type: "full_time",
  category: null,
  salary_min: 50000,
  salary_max: 60000,
  salary_currency: "USD",
  salary_period: "year",
  closing_date: "2026-11-01",
  published_at: "2026-10-01T00:00:00Z",
  description_html: "<p>Nights.</p>",
  apply_url: "https://example.com",
  apply_email: null,
  listing_slug: null,
  listing_name: null,
  expires_at: "2026-12-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
};

test("JobPosting JSON-LD uses only fields we hold, with validThrough at the earlier of closing and expiry", () => {
  const ld = jobPostingJsonLd(JOB, { pageUrl: "https://eyetoday.test/jobs/nurse" }) as Record<string, unknown>;
  assert.equal(ld["@type"], "JobPosting");
  assert.equal(ld.employmentType, "FULL_TIME");
  assert.equal(ld.validThrough, "2026-11-01T23:59:59.000Z");
  assert.deepEqual(ld.hiringOrganization, { "@type": "Organization", name: "Clinic A" });
  assert.equal((ld.baseSalary as { value: { unitText: string } }).value.unitText, "YEAR");
  assert.equal(ld.jobLocationType, undefined);
  const remote = jobPostingJsonLd({ ...JOB, remote: "remote", location: null, salary_min: null, salary_max: null, closing_date: null }, { pageUrl: null }) as Record<string, unknown>;
  assert.equal(remote.jobLocationType, "TELECOMMUTE");
  assert.equal(remote.baseSalary, undefined);
  assert.equal(remote.validThrough, "2026-12-01T00:00:00.000Z");
  assert.ok(!JSON.stringify(remote).includes("contact"));
});

test("filters, links and pay text", () => {
  assert.deepEqual(parsePostingFilters("job", { type: "contract", country: "za", remote: "hybrid", page: "3" }), { type: "contract", country: "ZA", remote: "hybrid", page: 3 });
  assert.deepEqual(parsePostingFilters("job", { type: "training", country: "ZAF", remote: "moon" }), { type: "", country: "", remote: "", page: 1 });
  assert.equal(parsePostingFilters("classified", { type: "training" }).type, "training");
  assert.equal(postingsHref("classified", { type: "services", country: "", remote: "remote", page: 1 }), "/classifieds?type=services&remote=remote");
  assert.equal(salaryText(JOB), "USD 50,000–60,000 a year");
  assert.equal(salaryText({ ...JOB, salary_max: null }), "From USD 50,000 a year");
  assert.equal(salaryText({ ...JOB, salary_currency: null }), null);
});

test("the posting form needs a way to apply, a location unless remote, and a currency for pay", () => {
  const form = (fields: Record<string, string>) => {
    const data = new FormData();
    const base = { title: "Nurse", organisation: "Clinic", remote: "onsite", location: "Tulum", employment_type: "full_time", description: "A long enough description.", apply_url: "https://x.test" };
    for (const [key, value] of Object.entries({ ...base, ...fields })) data.set(key, value);
    return data;
  };
  assert.equal(parsePostingForm("job", form({})).ok, true);
  assert.equal(parsePostingForm("job", form({ apply_url: "" })).ok, false);
  assert.equal(parsePostingForm("job", form({ location: "" })).ok, false);
  assert.equal(parsePostingForm("job", form({ location: "", remote: "remote" })).ok, true);
  assert.equal(parsePostingForm("job", form({ salary_min: "50,000" })).ok, false);
  const ok = parsePostingForm("job", form({ salary_min: "50,000", salary_currency: "usd" }));
  assert.ok(ok.ok && ok.data.salary_min === 50000 && ok.data.salary_currency === "USD" && ok.data.salary_period === "year");
  assert.equal(parsePostingForm("classified", form({})).ok, false);
});
