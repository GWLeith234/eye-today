import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DirectoryFrame } from "@/components/public/directory-frame";
import { VerificationBadge } from "@/components/public/listing-card";
import { StoryList } from "@/components/public/story-card";
import { countryName } from "@/lib/directory/countries";
import { listingJsonLd } from "@/lib/directory/jsonld";
import { getDirectoryListing, getRelatedStories } from "@/lib/directory/public";
import { mediaUrl } from "@/lib/media/url";
import { absoluteUrl } from "@/lib/public/site";
import { SLUG_RE } from "@/lib/slug";

export const dynamic = "force-dynamic";

function reviewed(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", { dateStyle: "long", timeZone: "UTC" }).format(date);
}

export async function generateMetadata({ params }: PageProps<"/directory/listing/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  if (!SLUG_RE.test(slug)) return {};
  const listing = await getDirectoryListing(slug);
  if (!listing) return {};
  const canonical = `/directory/listing/${listing.slug}`;
  const description = listing.description.trim().slice(0, 200) || `${listing.name} in the Eye Today directory.`;
  return {
    title: listing.name,
    description,
    alternates: { canonical },
    openGraph: { title: listing.name, description, url: canonical },
  };
}

export default async function ListingPage({ params }: PageProps<"/directory/listing/[slug]">) {
  const { slug } = await params;
  if (!SLUG_RE.test(slug)) notFound();
  const listing = await getDirectoryListing(slug);
  if (!listing) notFound();

  const canonical = `/directory/listing/${listing.slug}`;
  const pageUrl = absoluteUrl(canonical);
  const jsonLd = listingJsonLd({
    name: listing.name,
    category_slug: listing.category_slug,
    verification_level: listing.verification_level,
    description: listing.description,
    country_code: listing.country_code,
    region: listing.region,
    city: listing.city,
    website: listing.website,
    public_email: listing.public_email,
    public_phone: listing.public_phone,
    logoUrl: listing.logo_storage_path ? mediaUrl(listing.logo_storage_path, { width: 800 }) : null,
    pageUrl: pageUrl.startsWith("http") ? pageUrl : null,
  });
  const related = await getRelatedStories(listing.services ?? []);
  const when = reviewed(listing.last_reviewed_at);
  const place = [listing.city, listing.region, countryName(listing.country_code)].filter(Boolean).join(", ");
  const photos = (listing.photo_paths ?? []).map((path, index) => ({
    path,
    alt: listing.photo_alts?.[index] || listing.name,
  }));

  return (
    <DirectoryFrame>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <article className="flex flex-col gap-4">
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <Link href={`/directory?category=${listing.category_slug}`} className="font-semibold hover:underline">{listing.category_name}</Link>
          <VerificationBadge level={listing.verification_level} />
        </p>
        <h1 className="font-serif text-4xl font-bold">{listing.name}</h1>
        <p>{place}</p>
        {listing.logo_storage_path ? (
          <div className="relative h-24 w-24">
            <Image src={mediaUrl(listing.logo_storage_path, { width: 200 })} alt={listing.logo_alt || ""} fill sizes="96px" className="object-contain" />
          </div>
        ) : null}
        {listing.description ? <p className="max-w-2xl text-lg">{listing.description}</p> : null}
        <dl className="grid gap-2 text-sm sm:grid-cols-[10rem_1fr]">
          {listing.services && listing.services.length > 0 ? (
            <>
              <dt className="font-semibold">Services</dt>
              <dd>{listing.services.join(", ")}</dd>
            </>
          ) : null}
          {listing.languages && listing.languages.length > 0 ? (
            <>
              <dt className="font-semibold">Languages</dt>
              <dd>{listing.languages.join(", ")}</dd>
            </>
          ) : null}
          {listing.website ? (
            <>
              <dt className="font-semibold">Website</dt>
              <dd><a href={listing.website} rel="noopener noreferrer" target="_blank" className="text-accent underline">{listing.website}</a></dd>
            </>
          ) : null}
          {listing.public_email ? (
            <>
              <dt className="font-semibold">Email</dt>
              <dd><a href={`mailto:${listing.public_email}`} className="text-accent underline">{listing.public_email}</a></dd>
            </>
          ) : null}
          {listing.public_phone ? (
            <>
              <dt className="font-semibold">Phone</dt>
              <dd><a href={`tel:${listing.public_phone}`} className="text-accent underline">{listing.public_phone}</a></dd>
            </>
          ) : null}
        </dl>
        {when ? <p className="text-sm text-muted">Last reviewed {when}</p> : null}
        <p>
          <Link href={`/directory/${listing.country_code.toLowerCase()}`} className="text-accent underline">
            Legal status in {countryName(listing.country_code)}
          </Link>
        </p>
        <p>
          <Link href="/directory/how-we-verify" className="text-sm underline">What this verification level means</Link>
        </p>
        {listing.relationship_disclosure ? (
          <p className="border border-rule p-3 text-sm">
            <span className="font-semibold">Publisher relationship: </span>
            {listing.relationship_disclosure}
          </p>
        ) : null}
        {photos.length > 0 ? (
          <ul className="grid gap-3 sm:grid-cols-2">
            {photos.map((photo) => (
              <li key={photo.path} className="relative aspect-[3/2]">
                <Image src={mediaUrl(photo.path, { width: 1200 })} alt={photo.alt} fill sizes="(min-width: 640px) 50vw, 100vw" className="object-cover" />
              </li>
            ))}
          </ul>
        ) : null}
      </article>
      {related.length > 0 ? (
        <section aria-labelledby="related-stories">
          <h2 id="related-stories" className="mb-2 font-serif text-2xl font-bold">Related stories</h2>
          <StoryList cards={related} />
        </section>
      ) : null}
    </DirectoryFrame>
  );
}
