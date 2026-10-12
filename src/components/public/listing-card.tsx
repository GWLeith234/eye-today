import Image from "next/image";
import Link from "next/link";

import { countryName } from "@/lib/directory/countries";
import { CATEGORY_TONE, type ListingCard, verificationLabel } from "@/lib/directory/types";
import { mediaUrl } from "@/lib/media/url";
import { readPlatformLinks } from "@/lib/directory/podcast";

import { PlatformButtons } from "./platform-links";

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

// Photo first, the way a community directory reads: the facility photo carries the card, the logo sits
// small beside the name, and the description is a glimpse. Featured listings get the photo full-width.
// No photo: the logo stands in; no logo: the category colour.
export function ListingCardView({ card, podcast }: { card: ListingCard; podcast?: { platform_links: unknown; host_names: string | null } | null }) {
  const tone = CATEGORY_TONE[card.category_slug] ?? "bg-accent";
  const href = `/directory/listing/${card.slug}`;
  const photo = card.photo_storage_path ?? null;
  const logo = card.logo_storage_path ?? null;
  const wide = card.featured && !!photo;

  return (
    <article data-testid="listing-card" className={`flex gap-4 border-t border-rule py-5 ${wide ? "flex-col" : "flex-col sm:flex-row"}`}>
      <Link href={href} aria-hidden="true" tabIndex={-1} className={`relative block shrink-0 overflow-hidden bg-rule ${wide ? "aspect-[2/1] w-full" : "aspect-[3/2] w-full sm:w-56"}`}>
        {photo ? (
          <Image src={mediaUrl(photo, { width: wide ? 1600 : 640 })} alt={card.photo_alt ?? ""} fill sizes={wide ? "(min-width: 768px) 720px, 100vw" : "(min-width: 640px) 224px, 100vw"} className="object-cover" />
        ) : logo ? (
          <Image src={mediaUrl(logo, { width: 480 })} alt={card.logo_alt ?? ""} fill sizes="224px" className="object-contain p-6" />
        ) : (
          <span className={`absolute inset-0 ${tone} opacity-70`} />
        )}
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide">
          {card.featured ? (
            <span data-testid="featured-badge" className="bg-accent px-1.5 py-0.5 text-ink">Featured</span>
          ) : null}
          <span className={`inline-block h-2.5 w-2.5 ${tone}`} aria-hidden="true" />
          <span>{card.category_name}</span>
          <VerificationBadge level={card.verification_level} />
        </p>
        <div className="flex items-center gap-3">
          {photo && logo ? (
            <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded border border-rule bg-white p-1.5">
              <Image src={mediaUrl(logo, { width: 224 })} alt={card.logo_alt ?? ""} fill sizes="56px" className="object-contain p-1.5" />
            </span>
          ) : null}
          <h2 className="font-serif text-2xl font-bold leading-tight">
            <Link href={href} className="hover:underline">{card.name}</Link>
          </h2>
        </div>
        <p className="text-sm text-muted">{podcast?.host_names ? `Hosted by ${podcast.host_names} · ` : ""}{place(card)}</p>
        {card.description ? <p className="line-clamp-2 text-sm">{card.description}</p> : null}
        {podcast ? <PlatformButtons links={readPlatformLinks(podcast.platform_links)} /> : null}
        {card.relationship_disclosure ? (
          <p className="text-xs text-muted">
            <span className="font-semibold">Publisher relationship: </span>
            {card.relationship_disclosure}
          </p>
        ) : null}
        <p className="flex flex-wrap gap-x-4 text-sm">
          <Link href={href} className="font-semibold underline">View listing</Link>
          <Link href={`/directory/${card.country_code.toLowerCase()}`} className="text-accent hover:underline">
            Legal status in {countryName(card.country_code)}
          </Link>
        </p>
      </div>
    </article>
  );
}
