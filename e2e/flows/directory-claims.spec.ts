import { expect, test } from "@playwright/test";
import Stripe from "stripe";

import { adminClient, insertListing, removeListings } from "../helpers/admin";
import { signIn } from "../helpers/auth";
import { readStripeSessions, waitForMail } from "../helpers/mailbox";

const FULL = process.env.E2E_FULL === "1";
const SKIP = "Needs the seeded local stack, the mock mailbox and the Stripe double (the e2e job).";

function signedPost(payload: string) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
  return {
    data: payload,
    headers: { "stripe-signature": Stripe.webhooks.generateTestHeaderString({ payload, secret }), "content-type": "application/json" },
  };
}

function event(id: string, type: string, object: Record<string, unknown>) {
  return JSON.stringify({ id, object: "event", api_version: "2024-06-20", created: Math.floor(Date.now() / 1000), type, data: { object } });
}

test("claim with a domain email, propose an edit, an editor approves it, and verification is unchanged", async ({ browser, page }) => {
  test.skip(!FULL, SKIP);
  test.setTimeout(150_000);

  const stamp = Date.now().toString(36);
  const slug = `e2e-claim-${stamp}`;
  const name = `E2E Claim Clinic ${stamp}`;
  const domain = `claim-${stamp}.example`;
  const admin = adminClient();
  const listingId = await insertListing(admin, { slug, name, country: "MX", city: "Tulum", website: `https://www.${domain}/about`, level: "verified" });

  try {
    const reader = await signIn(browser, "reader");

    await test.step("a mailbox on another domain is turned away and nothing is sent", async () => {
      await reader.page.goto(`/directory/listing/${slug}`);
      await reader.page.getByRole("link", { name: "Claim this listing" }).click();
      await expect(reader.page).toHaveURL(new RegExp(`/account/listings/claim/${slug}`));
      await reader.page.getByLabel(/Your work email/).fill("someone@gmail.example");
      await reader.page.getByRole("button", { name: "Email me a code" }).click();
      await expect(reader.page.locator("main").getByRole("alert")).toContainText("not at the listing's website domain");
    });

    await test.step("a mailbox at the listing's domain gets a code and the code makes them an owner", async () => {
      const email = `owner@${domain}`;
      await reader.page.getByLabel(/Your work email/).fill(email);
      await reader.page.getByRole("button", { name: "Email me a code" }).click();
      await expect(reader.page.getByRole("status").first()).toContainText("We sent a code");

      const mail = await waitForMail(email, "code to manage");
      const code = /\b(\d{8})\b/.exec(mail.text)?.[1];
      expect(code, mail.text).toBeTruthy();

      // A wrong code does not say what was wrong.
      await reader.page.getByLabel("Code from the email").fill("00000000");
      await reader.page.getByRole("button", { name: "Confirm" }).click();
      await expect(reader.page.locator("main").getByRole("alert")).toContainText("That code did not work");

      // One wrong guess leaves the real code valid.
      await reader.page.getByLabel("Code from the email").fill(code!);
      await reader.page.getByRole("button", { name: "Confirm" }).click();
      await expect(reader.page).toHaveURL(/\/account\/listings\?claimed=1/);
      await expect(reader.page.getByTestId("owned-listing").filter({ hasText: name })).toBeVisible();
    });

    await test.step("the owner proposes an edit; nothing changes until an editor approves", async () => {
      await reader.page.getByTestId("owned-listing").filter({ hasText: name }).getByRole("link", { name: "Propose a change" }).click();
      await reader.page.getByLabel("City").fill("Playa del Carmen");
      await reader.page.getByLabel("Description").fill("A clinic description corrected by its owner.");
      await reader.page.getByRole("button", { name: "Send for review" }).click();
      await expect(reader.page.getByRole("status").first()).toContainText("An editor will review your changes");

      const { data: before } = await admin.from("directory_listings").select("city, verification_level").eq("id", listingId).single<{ city: string; verification_level: string }>();
      expect(before).toEqual({ city: "Tulum", verification_level: "verified" });
      const { data: proposals } = await admin.from("listing_edit_proposals").select("status, payload").eq("listing_id", listingId);
      expect(proposals).toHaveLength(1);
      expect(proposals![0].status).toBe("pending");
      expect(Object.keys(proposals![0].payload as object)).not.toContain("verification_level");
    });

    await test.step("an editor approves it; the change is live and the verification level is untouched", async () => {
      const editor = await signIn(browser, "editor");
      await editor.page.goto("/admin/directory");
      const proposal = editor.page.getByTestId("proposal").filter({ hasText: name });
      await expect(proposal).toContainText("Playa del Carmen");
      await proposal.getByRole("button", { name: "Approve change" }).click();
      await expect(editor.page.getByRole("status")).toContainText("Change applied");

      const { data: after } = await admin
        .from("directory_listings")
        .select("city, description, verification_level, status")
        .eq("id", listingId)
        .single<{ city: string; description: string; verification_level: string; status: string }>();
      expect(after).toEqual({
        city: "Playa del Carmen",
        description: "A clinic description corrected by its owner.",
        verification_level: "verified",
        status: "published",
      });

      await page.goto(`/directory/listing/${slug}`);
      await expect(page.getByText("Playa del Carmen").first()).toBeVisible();
      await expect(page.getByTestId("verification-badge")).toHaveText("Verified");
      await editor.page.context().close();
    });

    await reader.page.context().close();
  } finally {
    await removeListings(admin, slug);
  }
});

test("a featured listing is pinned first with a Featured label, lapses at period end, and stops when cancelled", async ({ browser, page }) => {
  test.skip(!FULL, SKIP);
  test.setTimeout(150_000);

  const stamp = Date.now().toString(36);
  const prefix = "e2e-feat-";
  const admin = adminClient();
  await removeListings(admin, prefix);
  // Alphabetically last, so only a feature can put it first.
  const alpha = await insertListing(admin, { slug: `${prefix}alpha-${stamp}`, name: `Alpha Feature Test ${stamp}`, country: "QQ" });
  const zulu = await insertListing(admin, { slug: `${prefix}zulu-${stamp}`, name: `Zulu Feature Test ${stamp}`, country: "QQ" });
  const zuluName = `Zulu Feature Test ${stamp}`;
  const alphaName = `Alpha Feature Test ${stamp}`;
  const list = "/directory?country=QQ&category=treatment-clinic";
  const cardNames = async () => page.getByTestId("listing-card").getByRole("heading").allInnerTexts();

  try {
    const owner = await signIn(browser, "reader");
    const { error: ownerError } = await admin.from("listing_owners").insert({ site_id: (await admin.from("directory_listings").select("site_id").eq("id", zulu).single()).data!.site_id, listing_id: zulu, profile_id: owner.id });
    expect(ownerError).toBeNull();

    await page.goto(list);
    expect(await cardNames()).toEqual([alphaName, zuluName]);
    await expect(page.getByTestId("featured-badge")).toHaveCount(0);

    await test.step("an owner starts a featured checkout for the featured monthly price", async () => {
      await owner.page.route("https://checkout.stripe.test/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<h1>Checkout</h1>" }));
      await owner.page.goto("/account/listings");
      const mine = owner.page.getByTestId("owned-listing").filter({ hasText: zuluName });
      await mine.getByRole("button", { name: "Feature monthly" }).click();
      await expect(owner.page).toHaveURL(/checkout\.stripe\.test\/e2e-session/);
      const sessions = readStripeSessions();
      expect(sessions.some((s) => s.mode === "subscription" && s.price === process.env.STRIPE_PRICE_FEATURED_MONTHLY)).toBe(true);
    });

    const subscription = `sub_e2e_feat_${stamp}`;
    const metadata = { kind: "directory_feature", listing_id: zulu, profile_id: owner.id };
    const completed = event(`evt_feat_${stamp}`, "checkout.session.completed", {
      id: `cs_feat_${stamp}`,
      object: "checkout.session",
      mode: "subscription",
      payment_status: "paid",
      subscription,
      customer: "cus_e2eTestCustomer",
      metadata,
    });

    await test.step("the paid webhook features it once, and a replay changes nothing", async () => {
      const first = await owner.page.request.post("/api/webhooks/stripe", signedPost(completed));
      expect(first.status(), await first.text()).toBe(200);
      const replay = await owner.page.request.post("/api/webhooks/stripe", signedPost(completed));
      expect(await replay.json()).toEqual({ ok: true, duplicate: true });
      const { data } = await admin.from("listing_features").select("status").eq("listing_id", zulu);
      expect(data).toEqual([{ status: "active" }]);

      await page.goto(list);
      expect(await cardNames()).toEqual([zuluName, alphaName]);
      await expect(page.getByTestId("listing-card").first().getByTestId("featured-badge")).toHaveText("Featured");
      await expect(page.getByTestId("featured-badge")).toHaveCount(1);
    });

    await test.step("a cancel-at-period-end subscription stays featured until the period ends", async () => {
      const end = Math.floor(Date.now() / 1000) + 10 * 86_400;
      const updated = event(`evt_feat_upd_${stamp}`, "customer.subscription.updated", {
        id: subscription,
        object: "subscription",
        status: "active",
        cancel_at_period_end: true,
        customer: "cus_e2eTestCustomer",
        metadata,
        items: { data: [{ current_period_end: end }] },
      });
      expect((await owner.page.request.post("/api/webhooks/stripe", signedPost(updated))).status()).toBe(200);
      await page.goto(list);
      expect(await cardNames()).toEqual([zuluName, alphaName]);
    });

    await test.step("once the period end has passed, the same listing is no longer featured", async () => {
      const { error } = await admin.from("listing_features").update({ current_period_end: new Date(Date.now() - 60_000).toISOString() }).eq("listing_id", zulu);
      expect(error).toBeNull();
      await page.goto(list);
      expect(await cardNames()).toEqual([alphaName, zuluName]);
      await expect(page.getByTestId("featured-badge")).toHaveCount(0);
    });

    await test.step("a cancelled subscription is recorded as cancelled", async () => {
      const deleted = event(`evt_feat_del_${stamp}`, "customer.subscription.deleted", {
        id: subscription,
        object: "subscription",
        status: "canceled",
        customer: "cus_e2eTestCustomer",
        metadata,
        items: { data: [{ current_period_end: Math.floor(Date.now() / 1000) - 60 }] },
      });
      expect((await owner.page.request.post("/api/webhooks/stripe", signedPost(deleted))).status()).toBe(200);
      const { data } = await admin.from("listing_features").select("status").eq("listing_id", zulu);
      expect(data).toEqual([{ status: "canceled" }]);
    });

    await owner.page.context().close();
  } finally {
    await removeListings(admin, prefix);
    await admin.from("listing_features").delete().in("listing_id", [alpha, zulu]);
  }
});

test("the map view lists the same names as the list view, with pins and visible attribution", async ({ page }) => {
  test.skip(!FULL, SKIP);
  test.setTimeout(90_000);

  const stamp = Date.now().toString(36);
  const prefix = "e2e-map-";
  const admin = adminClient();
  await removeListings(admin, prefix);
  const spots = [
    { n: "Tulum Map Test", lat: 20.2, lng: -87.4 },
    { n: "Lisbon Map Test", lat: 38.7, lng: -9.1 },
    { n: "Cape Map Test", lat: -33.9, lng: 18.4 },
  ];
  for (const spot of spots) {
    await insertListing(admin, { slug: `${prefix}${spot.n.split(" ")[0].toLowerCase()}-${stamp}`, name: `${spot.n} ${stamp}`, country: "QR", lat: spot.lat, lng: spot.lng });
  }
  // One without a position: in the list, not on the map.
  await insertListing(admin, { slug: `${prefix}nopin-${stamp}`, name: `Nopin Map Test ${stamp}`, country: "QR" });

  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });

  try {
    await page.route("https://tile.openstreetmap.org/**", (route) => route.fulfill({ status: 204 }));
    const names = async () => page.getByTestId("listing-card").getByRole("heading").allInnerTexts();

    await page.goto("/directory?country=QR");
    const listNames = await names();
    expect(listNames).toHaveLength(4);
    await expect(page.getByTestId("directory-map")).toHaveCount(0);

    await page.getByRole("link", { name: "Map", exact: true }).click();
    await expect(page).toHaveURL(/view=map/);
    await expect(page.getByTestId("directory-map")).toBeVisible();
    await expect(page.locator(".leaflet-marker-icon")).toHaveCount(3);
    await expect(page.getByText("OpenStreetMap")).toBeVisible();
    await expect(page.getByRole("heading", { name: "The directory did not load" })).toHaveCount(0);
    expect(pageErrors, pageErrors.join("\n")).toEqual([]);
    expect(await names()).toEqual(listNames);

    await page.getByRole("link", { name: "List", exact: true }).click();
    await expect(page.getByTestId("directory-map")).toHaveCount(0);
    expect(await names()).toEqual(listNames);
  } finally {
    await removeListings(admin, prefix);
  }
});
