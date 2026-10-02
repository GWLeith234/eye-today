import { format } from "date-fns";
import Link from "next/link";

import { requireArea } from "@/lib/auth/session";
import { getStripe } from "@/lib/membership/stripe";

import { openBillingPortal } from "./actions";

type MembershipRow = {
  status: string;
  current_period_end: string | null;
  amount_cents: number | null;
  stripe_subscription_id: string | null;
  membership_tiers: { name: string; interval: string } | null;
};

type InvoiceLine = { id: string; number: string | null; created: number; amount_paid: number; currency: string; status: string | null; url: string | null };

const ERRORS: Record<string, string> = {
  not_configured: "Billing is not configured.",
  no_customer: "There is no billing account to manage yet.",
  portal_failed: "We couldn't open the billing portal. Please try again.",
};

const money = (cents: number, currency = "cad") =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);

async function loadInvoices(customer: string, subscription: string): Promise<InvoiceLine[] | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  try {
    const list = await stripe.invoices.list({ customer, subscription, limit: 12 });
    return list.data.map((i) => ({
      id: i.id ?? "",
      number: i.number,
      created: i.created,
      amount_paid: i.amount_paid,
      currency: i.currency,
      status: i.status,
      url: i.hosted_invoice_url ?? null,
    }));
  } catch (error) {
    console.error(`invoice list failed: ${error instanceof Error ? error.name : "unknown"}`);
    return null;
  }
}

export default async function BillingPage({ searchParams }: PageProps<"/account/billing">) {
  const { supabase, user, profile } = await requireArea("account");
  const params = await searchParams;
  const error = typeof params.error === "string" ? ERRORS[params.error] : undefined;

  const [{ data: membership }, { data: customerRow }] = await Promise.all([
    supabase
      .from("memberships")
      .select("status, current_period_end, amount_cents, stripe_subscription_id, membership_tiers(name, interval)")
      .eq("profile_id", user.id)
      .maybeSingle<MembershipRow>(),
    supabase.from("profiles").select("stripe_customer_id").eq("id", user.id).maybeSingle<{ stripe_customer_id: string | null }>(),
  ]);
  const customer = customerRow?.stripe_customer_id ?? null;
  const invoices = membership?.stripe_subscription_id && customer ? await loadInvoices(customer, membership.stripe_subscription_id) : undefined;
  const isSupporter = profile?.role === "supporter";

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 p-8">
      <p className="text-sm"><Link href="/account" className="underline">Your account</Link> / Billing</p>
      <h1 className="text-3xl font-bold">Billing</h1>
      {error ? <p role="alert" className="rounded border border-red-600 p-3 text-sm">{error}</p> : null}

      <p data-testid="supporter-state" className="text-lg">
        {isSupporter ? <strong>Supporter</strong> : "Not a supporter yet"}
        {isSupporter ? " — thank you for keeping Eye Today free to read." : null}
      </p>

      {membership ? (
        <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1 text-sm">
          <dt className="opacity-70">Tier</dt>
          <dd>{membership.membership_tiers?.name ?? "Supporter"}</dd>
          <dt className="opacity-70">Status</dt>
          <dd>{membership.status.replace("_", " ")}</dd>
          <dt className="opacity-70">{membership.membership_tiers?.interval === "once" ? "Type" : "Current period ends"}</dt>
          <dd>
            {membership.membership_tiers?.interval === "once"
              ? "One-time gift"
              : membership.current_period_end
                ? format(new Date(membership.current_period_end), "d MMMM yyyy")
                : "—"}
          </dd>
          <dt className="opacity-70">Amount</dt>
          <dd>{membership.amount_cents != null ? money(membership.amount_cents) : "—"}</dd>
        </dl>
      ) : (
        <p className="text-sm">
          You have no membership. <Link href="/support" className="underline">See how to support Eye Today</Link>.
        </p>
      )}

      {membership?.stripe_subscription_id ? (
        <section aria-label="Payment history" className="flex flex-col gap-2">
          <h2 className="text-xl font-semibold">Payment history</h2>
          {invoices === null || invoices === undefined ? (
            <p className="text-sm">Payment history could not be loaded.</p>
          ) : invoices.length === 0 ? (
            <p className="text-sm">No invoices yet.</p>
          ) : (
            <ul className="flex flex-col divide-y border-y text-sm">
              {invoices.map((invoice) => (
                <li key={invoice.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    {format(new Date(invoice.created * 1000), "d MMM yyyy")} · {invoice.number ?? "Invoice"} · {invoice.status}
                  </span>
                  <span>
                    {money(invoice.amount_paid, invoice.currency)}
                    {invoice.url ? (
                      <>
                        {" · "}
                        <a href={invoice.url} target="_blank" rel="noopener noreferrer" className="underline">View</a>
                      </>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {customer ? (
        <form action={openBillingPortal}>
          <button type="submit" className="rounded bg-foreground px-4 py-2 text-background">Manage billing</button>
          <p className="mt-1 text-xs opacity-70">Update your card, download invoices or cancel. Cancelling keeps Supporter until the period ends.</p>
        </form>
      ) : null}
    </main>
  );
}
