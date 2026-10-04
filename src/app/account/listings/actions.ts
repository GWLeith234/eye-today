"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { requireArea } from "@/lib/auth/session";
import { claimErrorKey, newClaimCode, normalizeClaimCode } from "@/lib/directory/claims";
import { runFeaturedCheckout } from "@/lib/directory/featured";
import { buildProposalPayload } from "@/lib/directory/proposal";
import { sendMail } from "@/lib/email/resend";
import { rateLimit } from "@/lib/http/rate-limit";
import { getStripe } from "@/lib/membership/stripe";
import { SLUG_RE } from "@/lib/slug";
import { createAdminClient } from "@/lib/supabase/admin";

// Everything here runs as the signed-in user (the user-scoped client), so RLS and the definer functions
// decide what they may do. The one exception is set_listing_claim_code: the code is chosen by the
// server, and only the service role may store its hash (see 0014). It is called with a claim id that
// request_listing_claim just returned to this user, and nothing the user typed.

const uuid = z.uuid();

function claimUrl(slug: string, query: Record<string, string>) {
  return `/account/listings/claim/${slug}?${new URLSearchParams(query).toString()}`;
}

const listingFor = async (slug: string) => {
  const { createAnonClient } = await import("@/lib/supabase/anon");
  const anon = createAnonClient();
  if (!anon) return null;
  const { data } = await anon.rpc("directory_listing", { slug });
  return ((data ?? []) as { id: string; name: string }[])[0] ?? null;
};

export async function requestClaim(formData: FormData) {
  const { supabase, user } = await requireArea("account");
  const slug = String(formData.get("slug") ?? "");
  if (!SLUG_RE.test(slug)) redirect("/directory");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!rateLimit(`claim:${user.id}`, 10, 60 * 60 * 1000)) redirect(claimUrl(slug, { error: "limit" }));
  const listing = await listingFor(slug);
  if (!listing) redirect("/directory");

  const { data: claimId, error } = await supabase.rpc("request_listing_claim", { p_listing_id: listing.id, p_email: email });
  if (error || typeof claimId !== "string") redirect(claimUrl(slug, { error: claimErrorKey(error) }));

  // The server picks the code and stores its hash; the person claiming never sees or chooses it.
  const { code, hash } = newClaimCode();
  let mailTo: string | null = null;
  try {
    const admin = createAdminClient();
    const { data } = await admin.rpc("set_listing_claim_code", { p_claim_id: claimId, p_code_hash: hash });
    mailTo = typeof data === "string" ? data : null;
  } catch {
    redirect(claimUrl(slug, { error: "unavailable" }));
  }
  if (!mailTo) redirect(claimUrl(slug, { error: "unavailable" }));

  const mail = await sendMail({
    to: [mailTo],
    subject: `Your Eye Today code for ${listing.name}`,
    text: `Your code to manage "${listing.name}" in the Eye Today directory is ${code}.\n\nIt works for 30 minutes. If you did not ask for it, ignore this email: nothing changes.`,
  });
  if (!mail.ok) redirect(claimUrl(slug, { error: "mail" }));
  redirect(claimUrl(slug, { sent: "1" }));
}

export async function requestManualClaim(formData: FormData) {
  const { supabase, user } = await requireArea("account");
  const slug = String(formData.get("slug") ?? "");
  if (!SLUG_RE.test(slug)) redirect("/directory");
  if (!rateLimit(`claim:${user.id}`, 10, 60 * 60 * 1000)) redirect(claimUrl(slug, { error: "limit" }));
  const listing = await listingFor(slug);
  if (!listing) redirect("/directory");

  const { error } = await supabase.rpc("request_manual_listing_claim", {
    p_listing_id: listing.id,
    p_email: String(user.email ?? "").toLowerCase(),
  });
  if (error) redirect(claimUrl(slug, { error: claimErrorKey(error) }));
  redirect(claimUrl(slug, { manual: "1" }));
}

export async function confirmClaim(formData: FormData) {
  const { supabase, user } = await requireArea("account");
  const slug = String(formData.get("slug") ?? "");
  if (!SLUG_RE.test(slug)) redirect("/directory");
  // Five wrong codes expire the claim in the database; this limit slows guessing before that.
  if (!rateLimit(`claim-confirm:${user.id}`, 20, 60 * 60 * 1000)) redirect(claimUrl(slug, { error: "limit" }));
  const listing = await listingFor(slug);
  if (!listing) redirect("/directory");

  const { data, error } = await supabase.rpc("confirm_listing_claim", {
    p_listing_id: listing.id,
    p_code: normalizeClaimCode(String(formData.get("code") ?? "")),
  });
  // One answer for a wrong code, an expired one and anything else.
  if (error || data !== true) redirect(claimUrl(slug, { error: "bad_code" }));
  redirect("/account/listings?claimed=1");
}

export async function proposeEdit(formData: FormData) {
  const { supabase } = await requireArea("account");
  const id = uuid.safeParse(formData.get("listing_id"));
  if (!id.success) redirect("/account/listings");
  const payload = buildProposalPayload(formData);
  const { error } = await supabase.rpc("propose_listing_edit", { p_listing_id: id.data, p_payload: payload });
  if (error) {
    const key = error.message === "too many proposals" ? "proposals_limit" : error.code === "42501" ? "not_owner" : "invalid";
    redirect(`/account/listings/${id.data}/edit?error=${key}`);
  }
  redirect("/account/listings?proposed=1");
}

export async function startFeaturedCheckout(formData: FormData) {
  const { supabase, user } = await requireArea("account");
  const id = uuid.safeParse(formData.get("listing_id"));
  if (!id.success) redirect("/account/listings");
  if (!rateLimit(`featured-checkout:${user.id}`, 8, 10 * 60 * 1000)) redirect("/account/listings?error=featured_failed");

  const stripe = getStripe();
  const outcome = stripe
    ? await runFeaturedCheckout(
        {
          env: process.env,
          userId: user.id,
          email: user.email ?? null,
          listingId: id.data,
          isOwner: async () => {
            const { data } = await supabase.from("listing_owners").select("id").eq("listing_id", id.data).eq("profile_id", user.id).maybeSingle();
            return Boolean(data);
          },
          hasActiveFeature: async () => {
            const { data } = await supabase
              .from("listing_features")
              .select("id")
              .eq("listing_id", id.data)
              .eq("status", "active")
              .gt("current_period_end", new Date().toISOString())
              .limit(1);
            return (data ?? []).length > 0;
          },
          getStoredCustomer: async () => {
            const { data } = await supabase.from("profiles").select("stripe_customer_id").eq("id", user.id).maybeSingle<{ stripe_customer_id: string | null }>();
            return data?.stripe_customer_id ?? null;
          },
          createCustomer: async (params) => (await stripe.customers.create(params)).id,
          attachCustomer: async (customerId) => {
            await supabase.rpc("attach_stripe_customer", { customer: customerId });
          },
          createSession: async (params) => (await stripe.checkout.sessions.create(params)).url,
        },
        String(formData.get("interval") ?? ""),
      )
    : ({ ok: false, error: "not_configured" } as const);

  if (!outcome.ok) redirect(`/account/listings?error=featured_${outcome.error}`);
  redirect(outcome.url);
}

// Same Billing Portal as /account/billing, returning to the listings page.
export async function openFeaturedPortal() {
  const { supabase, user } = await requireArea("account");
  const stripe = getStripe();
  const origin = process.env.SITE_URL?.trim().replace(/\/+$/, "");
  if (!stripe || !origin) redirect("/account/listings?error=featured_not_configured");

  const { data } = await supabase.from("profiles").select("stripe_customer_id").eq("id", user.id).maybeSingle<{ stripe_customer_id: string | null }>();
  if (!data?.stripe_customer_id) redirect("/account/listings?error=portal_failed");

  let url: string | null = null;
  try {
    url = (await stripe.billingPortal.sessions.create({ customer: data.stripe_customer_id, return_url: `${origin}/account/listings` })).url;
  } catch (error) {
    console.error(`billing portal failed: ${error instanceof Error ? error.name : "unknown"}`);
  }
  redirect(url ?? "/account/listings?error=portal_failed");
}

