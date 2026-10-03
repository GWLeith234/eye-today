import "server-only";

import { cache } from "react";

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

export type Section = { id: string; name: string; slug: string; sort: number; color: string | null; icon: string | null };

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

// color and icon arrive with migration 0012. Until it is applied the wider select fails, so fall back to
// the original columns and the site keeps its navigation (sections then use their token colours).
// cache(): the header, the cards and the page share one query per request.
export const getSections = cache(async (): Promise<Section[]> => {
  const supabase = client();
  if (!supabase) return [];
  const wide = await supabase.from("sections").select("id, name, slug, sort, color, icon").order("sort").order("name");
  if (!wide.error) return (wide.data ?? []) as Section[];
  const narrow = await supabase.from("sections").select("id, name, slug, sort").order("sort").order("name");
  return ((narrow.data ?? []) as Omit<Section, "color" | "icon">[]).map((row) => ({ ...row, color: null, icon: null }));
});

export async function getSection(slug: string): Promise<Section | null> {
  return (await getSections()).find((section) => section.slug === slug) ?? null;
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
  const rows = (data ?? []) as { display_name: string | null; bio: string | null; disclosure: string | null; slug: string; avatar_url?: string | null }[];
  return rows[0] ?? null;
}

export const getRelated = (articleId: string) => cards("related_articles", { article: articleId });

export async function getBylines(articleId: string) {
  const supabase = client();
  if (!supabase) return [];
  const { data } = await supabase.rpc("article_public_bylines", { article: articleId });
  return (data ?? []) as { display_name: string | null; disclosure: string | null; author_slug: string | null; avatar_url?: string | null }[];
}

export type CardAuthor = { article_slug: string; author_slug: string | null; display_name: string | null; avatar_url: string | null };

// The first author and photo of a few stories in one section, in one call (the Opinion rail).
export async function getCardAuthors(sectionSlug: string, articleSlugs: string[]): Promise<CardAuthor[]> {
  const supabase = client();
  if (!supabase || articleSlugs.length === 0) return [];
  const { data, error } = await supabase.rpc("card_authors", { section_slug: sectionSlug, article_slugs: articleSlugs });
  if (error) return [];
  return (data ?? []) as CardAuthor[];
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
