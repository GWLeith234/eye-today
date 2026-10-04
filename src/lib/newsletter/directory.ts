import type { SupabaseClient } from "@supabase/supabase-js";

import { countryName } from "@/lib/directory/countries";

import { siteOrigin } from "./urls";

// "New in the directory": published listings created in the last 7 days, newest first. Missing listings
// mean no section at all. Runs with the editor's client (preview, test) or the service role (cron), and
// reads only columns anyone can read: never the verification note.

export type DirectoryItem = { name: string; url: string; place: string; category: string };

type Row = {
  name: string;
  slug: string;
  city: string | null;
  country_code: string;
  directory_categories: { name: string; hidden: boolean } | { name: string; hidden: boolean }[] | null;
};

export const DIRECTORY_WINDOW_DAYS = 7;
export const MAX_DIRECTORY_ITEMS = 8;

export async function newDirectoryListings(supabase: SupabaseClient, siteUrl: string, now: Date = new Date()): Promise<DirectoryItem[]> {
  const since = new Date(now.getTime() - DIRECTORY_WINDOW_DAYS * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("directory_listings")
    .select("name, slug, city, country_code, directory_categories(name, hidden)")
    .eq("status", "published")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(MAX_DIRECTORY_ITEMS * 2)
    .returns<Row[]>();
  if (error) return [];

  const items: DirectoryItem[] = [];
  for (const row of data ?? []) {
    const category = Array.isArray(row.directory_categories) ? row.directory_categories[0] : row.directory_categories;
    if (!category || category.hidden) continue;
    items.push({
      name: row.name,
      url: `${siteOrigin(siteUrl)}/directory/listing/${row.slug}`,
      place: [row.city, countryName(row.country_code)].filter(Boolean).join(", "),
      category: category.name,
    });
    if (items.length >= MAX_DIRECTORY_ITEMS) break;
  }
  return items;
}
