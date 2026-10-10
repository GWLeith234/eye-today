// First path segments that belong to the app, never to a section.
export const RESERVED_SECTION_SLUGS = new Set([
  "account", "admin", "api", "articles", "auth", "author", "contribute", "login",
  "preview", "search", "tag", "write-for-us", "about", "contact", "advertise",
  "newsletter", "newsletters", "support", "editorial-policy", "corrections", "privacy", "terms",
  "disclaimer", "ad-policy", "directory", "community-guidelines", "events", "events.ics", "jobs", "classifieds", "contests",
]);

export function isReservedSectionSlug(slug: string) {
  return RESERVED_SECTION_SLUGS.has(slug.toLowerCase());
}
