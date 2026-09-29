import "server-only";

import { createAnonClient } from "@/lib/supabase/anon";

import { type ArticleCard, articleHref } from "./data";
import { SITE_DESCRIPTION, SITE_NAME, absoluteUrl, publicDate } from "./site";

// Text for XML elements and attributes. Also drops characters XML 1.0 forbids.
export function xmlEscape(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

type LiveRow = {
  slug: string;
  title: string;
  status: string;
  published_at: string | null;
  scheduled_for: string | null;
  updated_at: string;
  is_sponsored: boolean;
  sections: { slug: string } | null;
};

const PAGE = 1000; // PostgREST's default max rows per request

// Every live article, through the cookie-less anon client: RLS returns only
// published stories and scheduled ones whose time has come.
export async function liveArticleRows(filter?: { since: Date }): Promise<LiveRow[]> {
  const supabase = createAnonClient();
  if (!supabase) return [];
  const rows: LiveRow[] = [];
  for (let from = 0; ; from += PAGE) {
    let query = supabase
      .from("articles")
      .select("slug, title, status, published_at, scheduled_for, updated_at, is_sponsored, sections(slug)")
      .order("id")
      .range(from, from + PAGE - 1);
    if (filter) {
      const since = filter.since.toISOString();
      query = query.or(`and(status.eq.published,published_at.gte.${since}),and(status.eq.scheduled,scheduled_for.gte.${since})`);
    }
    const { data, error } = await query.returns<LiveRow[]>();
    if (error) {
      console.error("public read live articles failed", error.code);
      break;
    }
    rows.push(...(data ?? []).filter((row) => row.sections));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

export const rowHref = (row: LiveRow) => `/${row.sections!.slug}/${row.slug}`;
export { publicDate };

const XML_HEADERS = { "Content-Type": "application/xml; charset=utf-8" };
const RSS_HEADERS = { "Content-Type": "application/rss+xml; charset=utf-8" };

export function xmlResponse(body: string) {
  return new Response(body, { headers: XML_HEADERS });
}

// RSS 2.0 with an atom:self link. guid is the canonical article URL.
export function rssResponse({ title, path, selfPath, description, items }: {
  title: string;
  path: string;
  selfPath: string;
  description: string;
  items: ArticleCard[];
}) {
  const entries = items
    .map((item) => {
      const url = absoluteUrl(articleHref(item));
      const headline = item.is_sponsored ? `Sponsored: ${item.title}` : item.title;
      return [
        "    <item>",
        `      <title>${xmlEscape(headline)}</title>`,
        `      <link>${xmlEscape(url)}</link>`,
        `      <guid isPermaLink="true">${xmlEscape(url)}</guid>`,
        item.published_at ? `      <pubDate>${new Date(item.published_at).toUTCString()}</pubDate>` : null,
        `      <category>${xmlEscape(item.section_name)}</category>`,
        item.dek ? `      <description>${xmlEscape(item.dek)}</description>` : null,
        "    </item>",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${xmlEscape(title)}</title>`,
    `    <link>${xmlEscape(absoluteUrl(path))}</link>`,
    `    <description>${xmlEscape(description)}</description>`,
    "    <language>en</language>",
    `    <atom:link href="${xmlEscape(absoluteUrl(selfPath))}" rel="self" type="application/rss+xml" />`,
    entries,
    "  </channel>",
    "</rss>",
    "",
  ]
    .filter((line) => line !== "")
    .join("\n");
  return new Response(`${body}\n`, { headers: RSS_HEADERS });
}

export { SITE_DESCRIPTION, SITE_NAME };
