import "server-only";

import { createAnonClient } from "@/lib/supabase/anon";

import { PAGE_SIZE } from "./paging";

// Public reads go through SECURITY DEFINER functions that only ever return live
// articles, called with the cookie-less anon client.

export type ArticleCard = {
  title: string;
  dek: string | null;
  article_slug: string;
  section_slug: string;
  section_name: string;
  published_at: string | null;
  hero_storage_path: string | null;
  hero_alt: string | null;
  hero_credit: string | null;
  hero_width: number | null;
  hero_height: number | null;
  is_sponsored: boolean;
  byline: string | null;
};

export type HomepageCard = ArticleCard & { slot: "lead" | "secondary"; slot_position: number };

export type Section = { id: string; name: string; slug: string; sort: number };

function client() {
  return createAnonClient();
}

async function cards(fn: string, args: Record<string, unknown>): Promise<ArticleCard[]> {
  const supabase = client();
  if (!supabase) return [];
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    console.error(`public read ${fn} failed`, error.code);
    return [];
  }
  return (data ?? []) as ArticleCard[];
}

async function count(fn: string, args: Record<string, unknown>): Promise<number> {
  const supabase = client();
  if (!supabase) return 0;
  const { data } = await supabase.rpc(fn, args);
  return typeof data === "number" ? data : 0;
}

export async function getSections(): Promise<Section[]> {
  const supabase = client();
  if (!supabase) return [];
  const { data } = await supabase.from("sections").select("id, name, slug, sort").order("sort").order("name");
  return (data ?? []) as Section[];
}

export async function getSection(slug: string): Promise<Section | null> {
  const supabase = client();
  if (!supabase) return null;
  const { data } = await supabase.from("sections").select("id, name, slug, sort").eq("slug", slug).maybeSingle<Section>();
  return data;
}

export async function getHomepage(): Promise<HomepageCard[]> {
  const supabase = client();
  if (!supabase) return [];
  const { data } = await supabase.rpc("homepage_public");
  return (data ?? []) as HomepageCard[];
}

export const getLatest = (lim: number, off = 0) => cards("latest_articles", { lim, off });
export const getMostRead = (lim = 5) => cards("most_read", { lim });

export const getSectionArticles = (slug: string, page = 1, lim = PAGE_SIZE) =>
  cards("section_articles", { section_slug: slug, lim, off: (page - 1) * lim });
export const getSectionCount = (slug: string) => count("section_article_count", { section_slug: slug });

export const getTagArticles = (slug: string, page = 1) =>
  cards("tag_articles", { tag_slug: slug, lim: PAGE_SIZE, off: (page - 1) * PAGE_SIZE });
export const getTagCount = (slug: string) => count("tag_article_count", { tag_slug: slug });

export const getAuthorArticles = (slug: string, page = 1) =>
  cards("author_articles", { author_slug: slug, lim: PAGE_SIZE, off: (page - 1) * PAGE_SIZE });
export const getAuthorCount = (slug: string) => count("author_article_count", { author_slug: slug });

export async function getAuthor(slug: string) {
  const supabase = client();
  if (!supabase) return null;
  const { data } = await supabase.rpc("author_public", { author_slug: slug });
  const rows = (data ?? []) as { display_name: string | null; bio: string | null; disclosure: string | null; slug: string }[];
  return rows[0] ?? null;
}

export const getRelated = (articleId: string) => cards("related_articles", { article: articleId });

export async function getBylines(articleId: string) {
  const supabase = client();
  if (!supabase) return [];
  const { data } = await supabase.rpc("article_public_bylines", { article: articleId });
  return (data ?? []) as { display_name: string | null; disclosure: string | null; author_slug: string | null }[];
}

export function articleHref(card: { section_slug: string; article_slug: string }) {
  return `/${card.section_slug}/${card.article_slug}`;
}

export type SearchResult = {
  title: string;
  dek: string | null;
  article_slug: string;
  section_slug: string;
  section_name: string;
  published_at: string | null;
  is_sponsored: boolean;
  snippet: string | null;
};

// Ranked full-text search over live articles (search_articles in 0006).
export async function searchArticles(q: string, section: string | null, page: number): Promise<SearchResult[]> {
  const supabase = client();
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("search_articles", { q, section_slug: section, page });
  if (error) {
    console.error("public read search_articles failed", error.code);
    return [];
  }
  return (data ?? []) as SearchResult[];
}

export const searchCount = (q: string, section: string | null) => count("search_article_count", { q, section_slug: section });
