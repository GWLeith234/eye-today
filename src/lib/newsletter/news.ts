import type { SupabaseClient } from "@supabase/supabase-js";

import type { NewsLink } from "@/lib/newsroom/model";

// "This week in the news": the five newest published links. Missing or empty: the section is left out.

export type NewsItem = { title: string; url: string; source: string; date: string };

export async function recentNewsLinks(supabase: SupabaseClient, limit = 5): Promise<NewsItem[]> {
  const { data, error } = await supabase.rpc("news_links_public", { p_page: 1, lim: limit });
  if (error) return [];
  return ((data as NewsLink[] | null) ?? []).map((row) => ({ title: row.title, url: row.url, source: row.source_name, date: row.published_on }));
}
