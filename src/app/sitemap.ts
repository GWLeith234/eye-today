import type { MetadataRoute } from "next";

import { getDirectorySitemap } from "@/lib/directory/public";
import { editionsSitemap } from "@/lib/editions/public";
import { eventsSitemap } from "@/lib/events/public";
import { postingsSitemap } from "@/lib/postings/public";
import { getSections } from "@/lib/public/data";
import { liveArticleRows, rowHref } from "@/lib/public/feeds";
import { isReservedSectionSlug } from "@/lib/public/reserved";
import { absoluteUrl } from "@/lib/public/site";

export const revalidate = 3600;

const STATIC_PAGES = [
  "/about", "/contact", "/advertise", "/write-for-us", "/editorial-policy",
  "/corrections", "/disclaimer", "/ad-policy", "/privacy", "/terms", "/community-guidelines", "/newsletter", "/support",
  "/directory", "/directory/how-we-verify", "/directory/submit", "/events", "/jobs", "/classifieds", "/jobs/policy", "/contests", "/editions",
];

// Live articles only: the anon client never sees drafts or future schedules.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [sections, articles, directory, events, postings, editions] = await Promise.all([
    getSections(),
    liveArticleRows(),
    getDirectorySitemap(),
    eventsSitemap(),
    postingsSitemap(),
    editionsSitemap(),
  ]);
  return [
    { url: absoluteUrl("/"), changeFrequency: "hourly", priority: 1 },
    ...sections
      .filter((section) => !isReservedSectionSlug(section.slug))
      .map((section) => ({ url: absoluteUrl(`/${section.slug}`), changeFrequency: "hourly" as const, priority: 0.8 })),
    ...articles.map((row) => ({ url: absoluteUrl(rowHref(row)), lastModified: row.updated_at })),
    ...directory.map((row) => ({
      url: absoluteUrl(row.kind === "country" ? `/directory/${row.slug}` : `/directory/listing/${row.slug}`),
      lastModified: row.updated_at,
    })),
    ...postings.map((row) => ({ url: absoluteUrl(`/${row.kind === "job" ? "jobs" : "classifieds"}/${row.slug}`), lastModified: row.updated_at })),
    ...events.map((row) => ({ url: absoluteUrl(`/events/${row.slug}`), lastModified: row.updated_at })),
    ...editions.map((row) => ({ url: absoluteUrl(`/editions/${row.slug}`), lastModified: row.public_from })),
    ...STATIC_PAGES.map((path) => ({ url: absoluteUrl(path), changeFrequency: "yearly" as const, priority: 0.3 })),
  ];
}
