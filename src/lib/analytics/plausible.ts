import "server-only";

import { unstable_cache } from "next/cache";

import { isReservedSectionSlug } from "@/lib/public/reserved";

export type PlausibleStats =
  | { configured: false }
  | { configured: true; ok: false; message: string }
  | {
      configured: true;
      ok: true;
      pageviews7d: number;
      pageviews30d: number;
      topArticles: { path: string; pageviews: number }[];
    };

type QueryResult = { results?: { metrics?: number[]; dimensions?: string[] }[] };

async function query(domain: string, apiKey: string, body: Record<string, unknown>): Promise<QueryResult | null> {
  const response = await fetch("https://plausible.io/api/v2/query", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ site_id: domain, ...body }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return null;
  return (await response.json()) as QueryResult;
}

function pageviews(payload: QueryResult | null): number | null {
  const value = payload?.results?.[0]?.metrics?.[0];
  return typeof value === "number" ? value : null;
}

function isArticlePath(path: string) {
  const parts = path.split("/").filter(Boolean);
  if (parts.length !== 2) return false;
  return !isReservedSectionSlug(parts[0]) && parts.every((part) => /^[a-z0-9-]+$/.test(part));
}

async function load(): Promise<PlausibleStats> {
  const domain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN?.trim();
  const apiKey = process.env.PLAUSIBLE_API_KEY?.trim();
  if (!domain || !apiKey) return { configured: false };

  try {
    const [week, month, pages] = await Promise.all([
      query(domain, apiKey, { metrics: ["pageviews"], date_range: "7d" }),
      query(domain, apiKey, { metrics: ["pageviews"], date_range: "30d" }),
      query(domain, apiKey, {
        metrics: ["pageviews"],
        date_range: "30d",
        dimensions: ["event:page"],
        order_by: [["pageviews", "desc"]],
        pagination: { limit: 50 },
      }),
    ]);
    const pageviews7d = pageviews(week);
    const pageviews30d = pageviews(month);
    if (pageviews7d === null || pageviews30d === null) {
      return { configured: true, ok: false, message: "Plausible did not return pageviews. Check the domain and API key." };
    }
    const topArticles = (pages?.results ?? [])
      .flatMap((row) => {
        const path = row.dimensions?.[0];
        const views = row.metrics?.[0];
        return path && typeof views === "number" && isArticlePath(path) ? [{ path, pageviews: views }] : [];
      })
      .slice(0, 20);
    return { configured: true, ok: true, pageviews7d, pageviews30d, topArticles };
  } catch {
    return { configured: true, ok: false, message: "Analytics is temporarily unavailable." };
  }
}

export const getPlausibleStats = unstable_cache(load, ["plausible-stats-v1"], { revalidate: 600 });
