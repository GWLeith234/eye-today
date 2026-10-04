import type { VerificationLevel } from "./types";

export type ListingJsonInput = {
  name: string;
  category_slug: string;
  verification_level: VerificationLevel | string;
  description: string;
  country_code: string;
  region: string | null;
  city: string | null;
  website: string | null;
  public_email: string | null;
  public_phone: string | null;
  logoUrl: string | null;
  pageUrl: string | null;
  lat?: number | null;
  lng?: number | null;
};

// Only fields we store. Clinic categories are MedicalClinic; every other
// category stays a LocalBusiness. No rating, review or price.
export function listingJsonLd(listing: ListingJsonInput): Record<string, unknown> {
  const clinic = listing.category_slug === "treatment-clinic" || listing.category_slug === "medical-practitioner";
  const address: Record<string, string> = {
    "@type": "PostalAddress",
    addressCountry: listing.country_code,
  };
  if (listing.region) address.addressRegion = listing.region;
  if (listing.city) address.addressLocality = listing.city;

  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": clinic ? "MedicalClinic" : "LocalBusiness",
    name: listing.name,
    address,
  };
  if (listing.description.trim()) data.description = listing.description.trim();
  if (listing.website && /^https:\/\//.test(listing.website)) data.url = listing.website;
  else if (listing.pageUrl) data.url = listing.pageUrl;
  if (listing.pageUrl) data.mainEntityOfPage = listing.pageUrl;
  if (listing.public_email) data.email = listing.public_email;
  if (listing.public_phone) data.telephone = listing.public_phone;
  if (listing.logoUrl) data.image = listing.logoUrl;
  if (typeof listing.lat === "number" && typeof listing.lng === "number") {
    data.geo = { "@type": "GeoCoordinates", latitude: listing.lat, longitude: listing.lng };
  }
  return data;
}
