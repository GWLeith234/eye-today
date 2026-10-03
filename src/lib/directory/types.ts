export const UNREVIEWED_SUBMISSION_NOTE = "Created from a public submission. Not yet reviewed.";

export const VERIFICATION_LEVELS = ["listed", "verified", "medically_supervised"] as const;
export type VerificationLevel = (typeof VERIFICATION_LEVELS)[number];

export const LISTING_STATUSES = ["draft", "pending", "published", "unpublished"] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

export const VERIFICATION_LABELS: Record<VerificationLevel, string> = {
  listed: "Listed",
  verified: "Verified",
  medically_supervised: "Medically supervised",
};

// A colour swatch so categories can be told apart. The label stays ink on paper.
export const CATEGORY_TONE: Record<string, string> = {
  "treatment-clinic": "bg-accent",
  "medical-practitioner": "bg-ink",
  "integration-coach": "bg-[#6b4c9a]",
  "harm-reduction": "bg-[#8a3d3d]",
  "peer-support": "bg-[#8a5a12]",
  "research-organisation": "bg-[#1d4e89]",
  "advocacy-group": "bg-[#3d5a40]",
};

export const DIRECTORY_PAGE_SIZE = 24;

export type ListingCard = {
  name: string;
  slug: string;
  category_slug: string;
  category_name: string;
  country_code: string;
  region: string | null;
  city: string | null;
  services: string[] | null;
  verification_level: string;
  description: string;
  logo_storage_path: string | null;
  logo_alt: string | null;
  has_legal: boolean;
};

export type ListingDetail = ListingCard & {
  languages: string[] | null;
  website: string | null;
  public_email: string | null;
  public_phone: string | null;
  relationship_disclosure: string | null;
  last_reviewed_at: string | null;
  photo_paths: string[] | null;
  photo_alts: string[] | null;
};

export type LegalStatus = {
  country_code: string;
  title: string;
  summary_html: string;
  sources: unknown;
  as_of: string | null;
};

export type DirectoryCategory = { slug: string; name: string; sort: number; hidden?: boolean };

export function isVerificationLevel(value: string): value is VerificationLevel {
  return (VERIFICATION_LEVELS as readonly string[]).includes(value);
}

export function verificationLabel(level: string): string {
  return isVerificationLevel(level) ? VERIFICATION_LABELS[level] : "Listed";
}
