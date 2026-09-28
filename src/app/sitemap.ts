import type { MetadataRoute } from "next";

import { getSections } from "@/lib/public/data";
import { liveArticleRows, rowHref } from "@/lib/public/feeds";
import { isReservedSectionSlug } from "@/lib/public/reserved";
import { absoluteUrl } from "@/lib/public/site";

export const revalidate = 3600;

const STATIC_PAGES = [
  "/about", "/contact", "/advertise", "/write-for-us", "/editorial-policy",
  "/corrections", "/privacy", "/terms", "/newsletter", "/support",
];

// Live articles only: the anon client never sees drafts or future schedules.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [sections, articles] = await Promise.all([getSections(), liveArticleRows()]);
  return [
    { url: absoluteUrl("/"), changeFrequency: "hourly", priority: 1 },
    ...sections
      .filter((section) => !isReservedSectionSlug(section.slug))
      .map((section) => ({ url: absoluteUrl(`/${section.slug}`), changeFrequency: "hourly" as const, priority: 0.8 })),
    ...articles.map((row) => ({ url: absoluteUrl(rowHref(row)), lastModified: row.updated_at })),
    ...STATIC_PAGES.map((path) => ({ url: absoluteUrl(path), changeFrequency: "yearly" as const, priority: 0.3 })),
  ];
}
