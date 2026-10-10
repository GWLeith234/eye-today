import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

import { signIn } from "../helpers/auth";
import { readStripeSessions } from "../helpers/mailbox";

// Definition of done: create a job posting → pay (Stripe double + signed webhook) → editor approves → on /jobs
// with JobPosting JSON-LD → once past its expiry it disappears, and the expiry job marks it expired.
test("a job is drafted, paid, approved, shown with JobPosting JSON-LD, and disappears after expiry", async ({ page, browser }) => {
  test.skip(process.env.E2E_FULL !== "1", "Needs the in-process Stripe double, a seeded local Supabase and editor and reader sessions.");
  test.setTimeout(150_000);

  const stamp = Date.now().toString(36);
  const title = `E2E Night Nurse ${stamp}`;
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const reader = await signIn(browser, "reader");
  await reader.page.goto("/account/postings/new?kind=job");
  await reader.page.getByLabel("Job title").fill(title);
  await reader.page.getByLabel("Organisation").fill("E2E Clinic");
  await reader.page.getByLabel("Employment type").selectOption("full_time");
  await reader.page.getByLabel("On site").check();
  await reader.page.getByLabel("Location", { exact: true }).fill("Durban");
  await reader.page.getByLabel("Country code").fill("ZA");
  await reader.page.getByLabel("From", { exact: true }).fill("400000");
  await reader.page.getByLabel("To", { exact: true }).fill("500000");
  await reader.page.getByLabel("Currency").fill("ZAR");
  await reader.page.getByLabel("Description").fill("Night shifts on a supervised ward. Nursing registration required.");
  await reader.page.getByLabel("Link to apply").fill("https://example.com/apply");
  await reader.page.getByRole("button", { name: "Save draft" }).click();
  await expect(reader.page).toHaveURL(/\/account\/postings\?saved=1/);

  const card = reader.page.getByTestId("own-posting").filter({ hasText: title });
  await expect(card).toContainText("Draft (not paid)");
  const postingId = await card.locator('input[name="id"]').getAttribute("value");
  expect(postingId).toMatch(/^[0-9a-f-]{36}$/);

  // Not public while a draft.
  await page.goto("/jobs");
  await expect(page.getByRole("link", { name: title, exact: true })).toHaveCount(0);

  await reader.page.route("https://checkout.stripe.test/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<h1>Checkout</h1>" }));
  await card.getByRole("button", { name: "30 days" }).click();
  await expect(reader.page).toHaveURL(/checkout\.stripe\.test\/e2e-session/);
  const session = readStripeSessions().reverse().find((line) => line.price === process.env.STRIPE_PRICE_POSTING_30);
  expect(session?.mode).toBe("payment");

  const secret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
  const payload = JSON.stringify({
    id: `evt_e2e_posting_${stamp}`,
    object: "event",
    api_version: "2024-06-20",
    created: Math.floor(Date.now() / 1000),
    type: "checkout.session.completed",
    data: {
      object: {
        id: `cs_e2e_posting_${stamp}`,
        object: "checkout.session",
        payment_status: "paid",
        mode: "payment",
        amount_total: 4900,
        currency: "usd",
        payment_intent: `pi_e2e_${stamp}`,
        client_reference_id: reader.id,
        metadata: { kind: "posting", posting_id: postingId, profile_id: reader.id, days: "30" },
      },
    },
  });
  const post = () =>
    reader.page.request.post("/api/webhooks/stripe", {
      data: payload,
      headers: { "stripe-signature": Stripe.webhooks.generateTestHeaderString({ payload, secret }), "content-type": "application/json" },
    });
  const first = await post();
  expect(first.status(), await first.text()).toBe(200);
  const replay = await post();
  expect(replay.status()).toBe(200);
  expect(await replay.json()).toEqual({ ok: true, duplicate: true });

  const { data: paid } = await admin.from("postings").select("status, paid_days").eq("id", postingId!).single();
  expect(paid).toEqual({ status: "pending", paid_days: 30 });
  const { count } = await admin.from("posting_payments").select("id", { count: "exact", head: true }).eq("posting_id", postingId!);
  expect(count).toBe(1);

  const editor = await signIn(browser, "editor");
  await editor.page.goto("/admin/postings");
  await editor.page.locator("li[data-posting-id]").filter({ hasText: title }).getByRole("button", { name: "Approve" }).click();
  await expect(editor.page.getByRole("status")).toContainText("Posting published");

  await page.goto("/jobs");
  const link = page.getByRole("link", { name: title, exact: true });
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(/\/jobs\/e2e-night-nurse-/);
  const slug = new URL(page.url()).pathname.split("/").pop();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await expect(page.getByText("ZAR 400,000–500,000 a year")).toBeVisible();
  const ld = JSON.parse((await page.getByTestId("job-posting-jsonld").textContent()) ?? "{}");
  expect(ld["@type"]).toBe("JobPosting");
  expect(ld.hiringOrganization.name).toBe("E2E Clinic");
  expect(ld.employmentType).toBe("FULL_TIME");
  expect(JSON.stringify(ld)).not.toContain(reader.email);

  await page.goto("/");
  await expect(page.getByRole("region", { name: "Latest jobs" }).getByRole("link", { name: title })).toBeVisible();

  // Time passes: the paid period ends.
  await admin.from("postings").update({ expires_at: new Date(Date.now() - 60_000).toISOString() }).eq("id", postingId!);
  await page.goto("/jobs");
  await expect(page.getByRole("link", { name: title, exact: true })).toHaveCount(0);
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "", {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: hidden } = await anon.rpc("posting_by_slug", { p_kind: "job", p_slug: slug });
  expect(hidden ?? []).toEqual([]);
  const { data: expired } = await admin.rpc("expire_postings");
  expect(expired).toBeGreaterThanOrEqual(1);
  const { data: after } = await admin.from("postings").select("status").eq("id", postingId!).single();
  expect(after?.status).toBe("expired");
});
