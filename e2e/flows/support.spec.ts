import { expect, test } from "@playwright/test";

import { queryRows } from "../helpers/db";
import { e2eEnv, e2eFull } from "../helpers/guard";
import { checkoutSessionsFor, signedEvent, stripeCalls } from "../helpers/stripe";
import { createTestUser, signInAs, uniqueId } from "../helpers/users";

// Without E2E_FULL the placeholder job has no Stripe configuration, so payments are closed.
test("support does not charge a card when payments are closed", async ({ page }) => {
  test.skip(e2eFull(), "Stripe is mocked, and payments are open, in the e2e-full job.");
  await page.goto("/support");
  await expect(page.getByRole("heading", { name: "Support us" })).toBeVisible();
  await expect(page.getByText("Payments are not open yet.")).toBeVisible();
});

test.describe("support checkout (Stripe mocked at the server boundary)", () => {
  test.skip(!e2eFull(), "Needs E2E_FULL=1 on a seeded local Supabase (the e2e-full CI job).");

  test("a signed-out visitor is sent to sign in before any Stripe call", async ({ page }) => {
    const before = stripeCalls().length;
    await page.goto("/support");
    await page.locator(`button[name="price_id"][value="${e2eEnv().prices.monthly}"]`).click();
    await expect(page).toHaveURL(/\/login\?next=%2Fsupport/);
    expect(stripeCalls().length).toBe(before);
  });

  test("checkout is created for the right price and customer, and a replayed webhook creates one membership", async ({ page, request }) => {
    test.setTimeout(120_000);
    const env = e2eEnv();
    const run = uniqueId();
    const reader = await createTestUser("supporter", "reader");

    const membershipRows = () =>
      queryRows<{ status: string; slug: string }>(
        "select m.status, t.slug from public.memberships m join public.membership_tiers t on t.id = m.tier_id where m.profile_id = $1",
        [reader.id],
      );
    const role = async () => (await queryRows<{ role: string }>("select role from public.profiles where id = $1", [reader.id]))[0]?.role;
    const post = (event: ReturnType<typeof signedEvent>) => request.post("/api/webhooks/stripe", { data: event.payload, headers: event.headers });

    await signInAs(page, reader, "/support");
    await page.route("https://checkout.stripe.invalid/**", (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "<h1>Mock Stripe Checkout</h1>" }),
    );

    await test.step("Subscribe creates one customer and one monthly checkout session", async () => {
      await expect(page.getByRole("heading", { name: "Support us" })).toBeVisible();
      await page.getByLabel("Email me the Supporters newsletter.").check();
      await page.locator(`button[name="price_id"][value="${env.prices.monthly}"]`).click();
      await expect(page).toHaveURL(/^https:\/\/checkout\.stripe\.invalid\/c\/pay\/cs_test_mock_/);
    });

    const [session] = checkoutSessionsFor(reader.id);
    expect(checkoutSessionsFor(reader.id)).toHaveLength(1);
    const customers = stripeCalls().filter((c) => c.op === "customers.create" && (c.params.metadata as { profile_id?: string } | undefined)?.profile_id === reader.id);
    expect(customers).toHaveLength(1);
    const customerId = customers[0].result.id;
    const subscriptionId = session.result.subscription!;

    await test.step("the session carries the right price, customer, user and return links", async () => {
      expect(customers[0].params.email).toBe(reader.email);
      expect(session.params).toMatchObject({
        mode: "subscription",
        customer: customerId,
        client_reference_id: reader.id,
        line_items: [{ price: env.prices.monthly, quantity: 1 }],
        metadata: { profile_id: reader.id, tier: "monthly", newsletter: "1" },
        success_url: `${env.siteUrl}/account/billing`,
        cancel_url: `${env.siteUrl}/support`,
      });
      const [profile] = await queryRows<{ stripe_customer_id: string | null }>("select stripe_customer_id from public.profiles where id = $1", [reader.id]);
      expect(profile?.stripe_customer_id).toBe(customerId);
      expect(await membershipRows()).toEqual([]);
    });

    const completed = (id: string) =>
      signedEvent({
        id,
        type: "checkout.session.completed",
        object: {
          id: session.result.id,
          object: "checkout.session",
          mode: "subscription",
          payment_status: "paid",
          client_reference_id: reader.id,
          customer: customerId,
          subscription: subscriptionId,
          metadata: session.params.metadata,
          amount_total: 800,
          customer_details: { email: reader.email },
        },
      });

    await test.step("a webhook with a bad signature is refused and changes nothing", async () => {
      const forged = completed(`evt_e2e_forged_${run}`);
      const response = await request.post("/api/webhooks/stripe", { data: forged.payload, headers: { ...forged.headers, "stripe-signature": "t=1,v1=00" } });
      expect(response.status()).toBe(400);
      expect(await membershipRows()).toEqual([]);
    });

    await test.step("the signed event makes the reader an active monthly supporter", async () => {
      const response = await post(completed(`evt_e2e_${run}`));
      expect(response.status()).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
      expect(await membershipRows()).toEqual([{ status: "active", slug: "monthly" }]);
      expect(await role()).toBe("supporter");
      const list = await queryRows<{ status: string }>(
        `select s.status from public.newsletter_subscribers s join public.newsletter_lists l on l.id = s.list_id where l.slug = 'supporters' and s.email = $1`,
        [reader.email],
      );
      expect(list).toEqual([{ status: "active" }]);
    });

    await test.step("replaying the same event is acknowledged and does not add a membership", async () => {
      const response = await post(completed(`evt_e2e_${run}`));
      expect(response.status()).toBe(200);
      expect(await response.json()).toEqual({ ok: true, duplicate: true });
      expect(await membershipRows()).toHaveLength(1);
      const [{ n }] = await queryRows<{ n: string }>("select count(*) as n from public.stripe_events where id = $1", [`evt_e2e_${run}`]);
      expect(n).toBe("1");
    });

    await test.step("a second event for the same checkout still leaves exactly one membership", async () => {
      const response = await post(completed(`evt_e2e_${run}_again`));
      expect(response.status()).toBe(200);
      expect(await membershipRows()).toEqual([{ status: "active", slug: "monthly" }]);
    });

    await test.step("an existing supporter is refused a second checkout before Stripe is called", async () => {
      await page.goto("/support");
      await page.locator(`button[name="price_id"][value="${env.prices.annual}"]`).click();
      await expect(page).toHaveURL(/\/support\?error=already_supporter$/);
      await expect(page.getByRole("alert")).toContainText("You are already a supporter.");
      expect(checkoutSessionsFor(reader.id)).toHaveLength(1);
    });
  });
});
