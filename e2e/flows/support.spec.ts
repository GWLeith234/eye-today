import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

import { signIn } from "../helpers/auth";
import { waitForStripeSession } from "../helpers/mailbox";

test("support does not charge a card when payments are closed", async ({ page }) => {
  test.skip(Boolean(process.env.STRIPE_SECRET_KEY), "Payments are configured for the full suite.");
  await page.goto("/support");
  await expect(page.getByRole("heading", { name: "Support us" })).toBeVisible();
  await expect(page.getByText("Payments are not open yet.")).toBeVisible();
});

test("checkout is requested once and a replayed webhook does not double-create a membership", async ({ browser }) => {
  test.skip(process.env.E2E_FULL !== "1", "Needs the in-process Stripe double and a signed-in reader.");
  test.setTimeout(90_000);

  const reader = await signIn(browser, "reader");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  await admin.from("memberships").delete().eq("profile_id", reader.id);

  await reader.page.route("https://checkout.stripe.test/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<h1>Checkout</h1>" }),
  );
  await reader.page.goto("/support");
  await reader.page.getByRole("button", { name: "Subscribe" }).first().click();
  await expect(reader.page).toHaveURL(/checkout\.stripe\.test\/e2e-session/);

  const session = await waitForStripeSession();
  expect(session.mode).toBe("subscription");
  expect(session.price).toBe(process.env.STRIPE_PRICE_MONTHLY);
  expect(session.customer).toMatch(/^cus_[A-Za-z0-9_]{6,64}$/);

  const secret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
  const payload = JSON.stringify({
    id: `evt_e2e_${reader.id.replace(/-/g, "").slice(0, 12)}_${Date.now()}`,
    object: "event",
    api_version: "2024-06-20",
    created: Math.floor(Date.now() / 1000),
    type: "checkout.session.completed",
    data: {
      object: {
        id: `cs_e2e_${reader.id.slice(0, 8)}`,
        object: "checkout.session",
        payment_status: "paid",
        mode: "subscription",
        client_reference_id: reader.id,
        subscription: "sub_e2e",
        amount_total: 800,
        metadata: { profile_id: reader.id, tier: "monthly", newsletter: "0" },
      },
    },
  });
  const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret });
  const post = () =>
    reader.page.request.post("/api/webhooks/stripe", {
      data: payload,
      headers: { "stripe-signature": signature, "content-type": "application/json" },
    });

  const first = await post();
  const firstBody = await first.text();
  expect(first.status(), firstBody).toBe(200);
  expect(JSON.parse(firstBody)).toEqual({ ok: true });

  const second = await post();
  const secondBody = await second.text();
  expect(second.status(), secondBody).toBe(200);
  expect(JSON.parse(secondBody)).toEqual({ ok: true, duplicate: true });

  const { count, error } = await admin.from("memberships").select("id", { count: "exact", head: true }).eq("profile_id", reader.id);
  expect(error).toBeNull();
  expect(count).toBe(1);

  await reader.page.context().close();
});
