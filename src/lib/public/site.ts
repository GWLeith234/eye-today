// Site-wide constants and URL helpers for public pages, feeds and metadata.

export const SITE_NAME = "Eye Today";
export const SITE_DESCRIPTION = "News, research and stories about eye health.";

// The pinned public origin, or null. SITE_URL is also metadataBase in the root layout.
export function siteOrigin(): string | null {
  const pinned = process.env.SITE_URL?.trim();
  return pinned ? pinned.replace(/\/+$/, "") : null;
}

// Absolute when SITE_URL is set; otherwise the path stays relative.
export function absoluteUrl(path: string): string {
  const origin = siteOrigin();
  return origin ? `${origin}${path}` : path;
}

// Published date for published stories, scheduled time for scheduled ones.
export function publicDate(row: { status: string; published_at: string | null; scheduled_for: string | null }) {
  return row.status === "scheduled" ? row.scheduled_for : row.published_at;
}
