import Image from "next/image";
import Link from "next/link";

import { countryName } from "@/lib/directory/countries";
import { CATEGORY_TONE, type ListingCard, verificationLabel } from "@/lib/directory/types";
import { mediaUrl } from "@/lib/media/url";

function place(card: ListingCard): string {
  return [card.city, card.region, countryName(card.country_code)].filter(Boolean).join(", ");
}

export function VerificationBadge({ level }: { level: string }) {
  return (
    <Link
      href="/directory/how-we-verify"
      data-testid="verification-badge"
      className="inline-block border border-ink px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide hover:underline"
    >
      {verificationLabel(level)}
    </Link>
  );
}

export function ListingCardView({ card }: { card: ListingCard }) {
  const tone = CATEGORY_TONE[card.category_slug] ?? "bg-accent";
  return (
    <article data-testid="listing-card" className="flex gap-3 border-t border-rule py-4">
      {card.logo_storage_path ? (
        <div className="relative h-16 w-16 shrink-0">
          <Image
            src={mediaUrl(card.logo_storage_path, { width: 128 })}
            alt={card.logo_alt || ""}
            fill
            sizes="64px"
            className="object-contain"
          />
        </div>
      ) : (
        <span aria-hidden="true" className={`mt-1 inline-block h-4 w-4 shrink-0 ${tone}`} />
      )}
      <div className="flex min-w-0 flex-col gap-1">
        <p className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide">
          {card.featured ? (
            <span data-testid="featured-badge" className="bg-accent px-1.5 py-0.5 text-ink">Featured</span>
          ) : null}
          <span className={`inline-block h-2.5 w-2.5 ${tone}`} aria-hidden="true" />
          <span>{card.category_name}</span>
          <VerificationBadge level={card.verification_level} />
        </p>
        <h2 className="font-serif text-xl font-bold leading-snug">
          <Link href={`/directory/listing/${card.slug}`} className="hover:underline">{card.name}</Link>
        </h2>
        <p className="text-sm text-muted">{place(card)}</p>
        {card.description ? <p className="text-sm">{card.description}</p> : null}
        {card.relationship_disclosure ? (
          <p className="text-sm">
            <span className="font-semibold">Publisher relationship: </span>
            {card.relationship_disclosure}
          </p>
        ) : null}
        <Link href={`/directory/${card.country_code.toLowerCase()}`} className="text-sm text-accent hover:underline">
          Legal status in {countryName(card.country_code)}
        </Link>
      </div>
    </article>
  );
}
