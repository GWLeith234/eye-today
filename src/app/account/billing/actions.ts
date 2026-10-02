"use server";

import { redirect } from "next/navigation";

import { requireArea } from "@/lib/auth/session";
import { getStripe } from "@/lib/membership/stripe";

// Opens the Stripe Billing Portal for the signed-in user's own customer. Cancelling there ends the
// subscription at the period end; the webhook keeps Supporter until Stripe says it has ended.
export async function openBillingPortal() {
  const { supabase, user } = await requireArea("account");
  const stripe = getStripe();
  const origin = process.env.SITE_URL?.trim().replace(/\/+$/, "");
  if (!stripe || !origin) redirect("/account/billing?error=not_configured");

  const { data } = await supabase.from("profiles").select("stripe_customer_id").eq("id", user.id).maybeSingle<{ stripe_customer_id: string | null }>();
  if (!data?.stripe_customer_id) redirect("/account/billing?error=no_customer");

  let url: string | null = null;
  try {
    url = (await stripe.billingPortal.sessions.create({ customer: data.stripe_customer_id, return_url: `${origin}/account/billing` })).url;
  } catch (error) {
    console.error(`billing portal failed: ${error instanceof Error ? error.name : "unknown"}`);
  }
  redirect(url ?? "/account/billing?error=portal_failed");
}
