import Link from "next/link";

import { CLAIM_MESSAGES } from "@/lib/directory/claims";
import { FEATURED_MESSAGES, type FeaturedError, featuredOffered } from "@/lib/directory/featured";
import { requireArea } from "@/lib/auth/session";

import { openFeaturedPortal, startFeaturedCheckout } from "./actions";

export const dynamic = "force-dynamic";

type Owned = { listing_id: string; directory_listings: { id: string; slug: string; name: string; status: string } | null };
type Proposal = { id: string; listing_id: string; status: string; created_at: string; payload: Record<string, unknown> };
type Feature = { listing_id: string; status: string; current_period_end: string | null };

const NOTICES: Record<string, string> = {
  claimed: "You now manage this listing. Edits you propose are reviewed by an editor before they appear.",
  proposed: "Thank you. An editor will review your changes. Nothing changes on the listing until they approve.",
  featured: "Thank you. Your listing is featured as soon as the payment is confirmed.",
};

const when = (value: string | null) =>
  value ? new Intl.DateTimeFormat("en-CA", { dateStyle: "long", timeZone: "UTC" }).format(new Date(value)) : "";

export default async function AccountListingsPage({ searchParams }: PageProps<"/account/listings">) {
  const { supabase } = await requireArea("account");
  const params = await searchParams;
  const notice = ["claimed", "proposed", "featured"].map((key) => (params[key] === "1" ? NOTICES[key] : null)).find(Boolean);
  const errorKey = typeof params.error === "string" ? params.error : "";
  const error = errorKey.startsWith("featured_")
    ? FEATURED_MESSAGES[errorKey.slice("featured_".length) as FeaturedError]
    : errorKey === "portal_failed"
      ? "We couldn't open billing. Please try again."
      : (CLAIM_MESSAGES[errorKey] ?? null);

  const [{ data: owned }, { data: proposals }, { data: features }] = await Promise.all([
    supabase.from("listing_owners").select("listing_id, directory_listings(id, slug, name, status)").returns<Owned[]>(),
    supabase.from("listing_edit_proposals").select("id, listing_id, status, created_at, payload").order("created_at", { ascending: false }).returns<Proposal[]>(),
    supabase.from("listing_features").select("listing_id, status, current_period_end").returns<Feature[]>(),
  ]);
  const listings = (owned ?? []).flatMap((row) => (row.directory_listings ? [row.directory_listings] : []));
  const offered = featuredOffered(process.env);
  const now = Date.now();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold">Your listings</h1>
        <p className="text-sm text-muted">Listings you manage in the directory. <Link href="/account" className="underline">Back to your account</Link></p>
      </header>
      {notice ? <p role="status" className="rounded border border-green-600 p-3 text-sm">{notice}</p> : null}
      {error ? <p role="alert" className="rounded border border-red-600 p-3 text-sm">{error}</p> : null}

      {listings.length === 0 ? (
        <p>
          You don&apos;t manage a listing yet. Open a listing in the <Link href="/directory" className="underline">directory</Link> and choose
          &ldquo;Claim this listing&rdquo;.
        </p>
      ) : null}

      <ul className="flex flex-col gap-6">
        {listings.map((listing) => {
          const own = (proposals ?? []).filter((p) => p.listing_id === listing.id);
          const feature = (features ?? []).find((f) => f.listing_id === listing.id && f.status === "active" && f.current_period_end && new Date(f.current_period_end).getTime() > now);
          return (
            <li key={listing.id} className="flex flex-col gap-3 border border-rule p-4" data-testid="owned-listing">
              <h2 className="text-xl font-semibold">
                <Link href={`/directory/listing/${listing.slug}`} className="hover:underline">{listing.name}</Link>
              </h2>
              <p className="text-sm">
                <Link href={`/account/listings/${listing.id}/edit`} className="underline">Propose a change</Link>
                {" · "}
                <span className="text-muted">An editor reviews every change. You cannot change the verification level.</span>
              </p>

              {own.length > 0 ? (
                <ul className="text-sm">
                  {own.slice(0, 5).map((proposal) => (
                    <li key={proposal.id}>
                      Change proposed {when(proposal.created_at)}: <strong>{proposal.status}</strong>
                    </li>
                  ))}
                </ul>
              ) : null}

              {feature ? (
                <div className="flex flex-col gap-2 text-sm">
                  <p>Featured until {when(feature.current_period_end)}. It stops at that date if you cancel.</p>
                  <form action={openFeaturedPortal}>
                    <button type="submit" className="rounded border border-ink px-3 py-1">Manage billing</button>
                  </form>
                </div>
              ) : offered ? (
                <form action={startFeaturedCheckout} className="flex flex-wrap items-center gap-3 text-sm">
                  <input type="hidden" name="listing_id" value={listing.id} />
                  <span>Feature this listing. It is labelled &ldquo;Featured&rdquo; and does not change its verification.</span>
                  <button type="submit" name="interval" value="monthly" className="rounded bg-ink px-3 py-1 text-paper">Feature monthly</button>
                  <button type="submit" name="interval" value="annual" className="rounded border border-ink px-3 py-1">Feature annually</button>
                </form>
              ) : null}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
