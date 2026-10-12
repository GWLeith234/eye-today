import type { Metadata } from "next";

import { type AudiencePanel, AudiencePanels } from "@/components/public/audience-panels";
import { StaticPage } from "@/components/public/static-page";
import { CHECKOUT_MESSAGES, type CheckoutError } from "@/lib/membership/checkout";
import { paymentsOpen, priceIds, TIER_SLUGS, type TierSlug } from "@/lib/membership/prices";
import { createAnonClient } from "@/lib/supabase/anon";

import { startCheckout } from "./actions";

export const metadata: Metadata = { title: "Support us", alternates: { canonical: "/support" } };
// Reads the payment settings at request time, and no cookies: the page is the same for everyone.
export const dynamic = "force-dynamic";

type Tier = { slug: TierSlug; name: string; description: string | null; price_cents: number };

const cad = (cents: number) => new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(cents / 100);
const CADENCE: Record<TierSlug, string> = { monthly: "a month", annual: "a year", once: "one time" };

const PANELS: AudiencePanel[] = [
  {
    id: "families",
    kicker: "Families & patients",
    title: "Keep the reporting free for the next family",
    body: "You found us because someone you love is weighing a treatment with real risks. Supporters keep every story, every country page and every listing free to read, with no login, so the next family finds the same.",
    links: [{ href: "/directory/how-we-verify", label: "How we verify clinics" }],
  },
  {
    id: "clinics",
    kicker: "Clinics & practitioners",
    title: "Back the standard you are held to",
    body: "Clinics that support Eye Today buy no influence: supporters are never named on stories or listings, and a supporting clinic is verified exactly like any other. What you back is independent reporting on your own field.",
    links: [{ href: "/editorial-policy", label: "Editorial policy" }],
  },
  {
    id: "researchers",
    kicker: "Researchers & funders",
    title: "Fund the record you cite",
    body: "The Trials & Funding Tracker and the Legal Map take editor hours to keep current and sourced. Supporters pay for those hours, and get early access to each monthly edition.",
    links: [{ href: "/tracker", label: "Trials & Funding Tracker" }],
  },
  {
    id: "policy",
    kicker: "Policy & press",
    title: "Independent reporting on a regulated question",
    body: "Ibogaine policy is moving fast in Texas, Washington and beyond. A newsroom with no clinic on its cap table is the one that can report it straight. Supporter funding is what makes that possible.",
    links: [{ href: "/legal-map", label: "Legal Map" }],
  },
];

async function loadTiers(): Promise<Tier[]> {
  const supabase = createAnonClient();
  if (!supabase) return [];
  const { data } = await supabase.from("membership_tiers").select("slug, name, description, price_cents").in("slug", [...TIER_SLUGS]);
  const rows = (data ?? []) as Tier[];
  return TIER_SLUGS.flatMap((slug) => rows.filter((row) => row.slug === slug));
}

export default async function SupportPage({ searchParams }: PageProps<"/support">) {
  const params = await searchParams;
  const tiers = paymentsOpen(process.env) ? await loadTiers() : [];
  const ids = priceIds(process.env);
  const error = typeof params.error === "string" && params.error in CHECKOUT_MESSAGES ? CHECKOUT_MESSAGES[params.error as CheckoutError] : null;

  if (tiers.length < TIER_SLUGS.length) {
    return (
      <StaticPage title="Support us">
        <div className="flex flex-col gap-8 text-base">
          <p>Payments are not open yet. When reader support launches, you will be able to contribute here.</p>
          <AudiencePanels heading="Why support Eye Today" intro="Whoever you are, here is what your support pays for." panels={PANELS} />
        </div>
      </StaticPage>
    );
  }

  return (
    <StaticPage title="Support us">
      <p>
        Eye Today&apos;s reporting stays free to read, with no login and no paywall. Supporters make that possible.
        Prices are in Canadian dollars. You will sign in first, and you pay on Stripe&apos;s secure page.
      </p>
      {error ? (
        <p role="alert" className="mt-4 rounded border border-red-600 p-3 text-base">
          {error}
        </p>
      ) : null}

      <div className="mt-6 text-base">
        <AudiencePanels heading="Why support Eye Today" intro="Whoever you are, here is what your support pays for." panels={PANELS} />
      </div>

      <form action={startCheckout} className="mt-6 flex flex-col gap-5 text-base">
        <ul className="grid gap-4 sm:grid-cols-3">
          {tiers.map((tier) => (
            <li key={tier.slug} className="flex flex-col gap-2 border border-rule bg-white/60 p-4">
              <h2 className="font-serif text-xl font-bold">{tier.name}</h2>
              <p className="text-2xl font-semibold">
                {cad(tier.price_cents)} <span className="text-sm font-normal text-muted">{CADENCE[tier.slug]}</span>
              </p>
              {tier.description ? <p className="text-sm">{tier.description}</p> : null}
              <button
                type="submit"
                name="price_id"
                value={ids[tier.slug] ?? ""}
                className="mt-auto rounded bg-ink px-4 py-2 text-paper"
              >
                {tier.slug === "once" ? "Give once" : "Subscribe"}
              </button>
            </li>
          ))}
        </ul>
        <label className="flex items-start gap-2">
          <input type="checkbox" name="newsletter" className="mt-1" />
          <span>
            Email me the Supporters newsletter.
            <span className="block text-sm text-muted">
              Ticking this box is your request for that list. We add your account email once your payment goes through, and every
              message has an unsubscribe link.
            </span>
          </span>
        </label>
      </form>
    </StaticPage>
  );
}
