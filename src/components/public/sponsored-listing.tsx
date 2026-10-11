import Link from "next/link";

import { getSponsoredListing } from "@/lib/directory/public";

import { ListingCardView } from "./listing-card";

// A premium listing, rotated at random and labelled as paid. Nothing renders when none is live.
export async function SponsoredListing() {
  const card = await getSponsoredListing();
  if (!card) return null;
  return (
    <section aria-labelledby="sponsored-listing" data-testid="sponsored-listing" className="flex flex-col gap-2 border-t-2 border-ink pt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="sponsored-listing" className="font-display text-2xl font-semibold">From the directory</h2>
        <p className="text-xs uppercase tracking-widest text-muted">
          Premium listing · paid placement · <Link href="/advertise" className="underline">about our ads</Link>
        </p>
      </div>
      <div>
        <ListingCardView card={card} />
      </div>
      <p className="text-sm text-muted">A listing is not an endorsement.</p>
    </section>
  );
}
