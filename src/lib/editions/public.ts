import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createAnonClient } from "@/lib/supabase/anon";
import { createClient } from "@/lib/supabase/server";

// Reads go through the definer functions in 0019. The archive and reader use the cookie client so a
// signed-in supporter's early access counts; the anon client is the signed-out view (sitemap, feeds).

export type EditionCard = {
  slug: string;
  title: string;
  issue_month: string;
  cover_storage_path: string | null;
  cover_alt: string | null;
  access: "public" | "early";
  public_from: string;
  story_count: number;
};

export type EditionDetail = {
  id: string;
  slug: string;
  title: string;
  issue_month: string;
  cover_storage_path: string | null;
  cover_alt: string | null;
  letter_html: string;
  access: "public" | "early";
  public_from: string;
  pdf_path: string | null;
  pdf_generated_at: string | null;
  updated_at: string;
};

export type EditionStory = {
  sort: number;
  article_id: string;
  article_slug: string;
  section_slug: string;
  section_name: string;
  title: string;
  dek: string | null;
  body_html: string | null;
  published_at: string;
  hero_storage_path: string | null;
  hero_alt: string | null;
  hero_credit: string | null;
  byline: string | null;
};

async function reader(): Promise<SupabaseClient | null> {
  try {
    return await createClient();
  } catch {
    return createAnonClient();
  }
}

export async function listEditions(client?: SupabaseClient | null): Promise<EditionCard[]> {
  const supabase = client ?? (await reader());
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("editions_public");
  if (error) console.error("public read editions_public failed", error.code);
  return (data as EditionCard[] | null) ?? [];
}

export async function getEdition(slug: string, client?: SupabaseClient | null): Promise<EditionDetail | null> {
  const supabase = client ?? (await reader());
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("edition_by_slug", { p_slug: slug });
  if (error) console.error("public read edition_by_slug failed", error.code);
  return ((data as EditionDetail[] | null) ?? [])[0] ?? null;
}

export async function getEditionStories(editionId: string, client?: SupabaseClient | null): Promise<EditionStory[]> {
  const supabase = client ?? (await reader());
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("edition_stories", { p_edition: editionId });
  if (error) console.error("public read edition_stories failed", error.code);
  return (data as EditionStory[] | null) ?? [];
}

// Signed-out view, for the sitemap.
export async function editionsSitemap(): Promise<{ slug: string; public_from: string }[]> {
  const rows = await listEditions(createAnonClient());
  return rows.filter((row) => row.access === "public").map((row) => ({ slug: row.slug, public_from: row.public_from }));
}
