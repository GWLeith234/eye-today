"use server";

import { redirect } from "next/navigation";

import { loginPath } from "@/lib/auth/access";
import { getSession } from "@/lib/auth/session";
import { runCheckout } from "@/lib/membership/checkout";
import { type MembershipLike, nextRole } from "@/lib/membership/roles";
import { getStripe } from "@/lib/membership/stripe";

// Starts Stripe Checkout with a server redirect. The price id comes from the form, so runCheckout
// only accepts one of the three configured prices. Signed-out visitors go to sign in first.
export async function startCheckout(formData: FormData) {
  const { supabase, user } = await getSession();
  if (!user) redirect(loginPath("/support"));

  const stripe = getStripe();
  const outcome = stripe
    ? await runCheckout(
        {
          env: process.env,
          userId: user.id,
          email: user.email ?? null,
          createCustomer: async (params) => (await stripe.customers.create(params)).id,
          createSession: async (params) => (await stripe.checkout.sessions.create(params)).url,
          getStoredCustomer: async () => {
            const { data } = await supabase.from("profiles").select("stripe_customer_id").eq("id", user.id).maybeSingle<{ stripe_customer_id: string | null }>();
            return data?.stripe_customer_id ?? null;
          },
          attachCustomer: async (customerId) => {
            await supabase.rpc("attach_stripe_customer", { customer: customerId });
          },
          hasActiveMembership: async () => {
            const { data } = await supabase.from("memberships").select("status, current_period_end").eq("profile_id", user.id);
            return nextRole("reader", (data ?? []) as MembershipLike[]) === "supporter";
          },
        },
        { priceId: String(formData.get("price_id") ?? ""), newsletter: formData.get("newsletter") === "on" },
      )
    : ({ ok: false, error: "not_configured" } as const);

  if (!outcome.ok) redirect(`/support?error=${outcome.error}`);
  redirect(outcome.url);
}
