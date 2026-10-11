import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { EditionDetail, EditionStory } from "./public";

// Editor-side reads: an editor may see a draft edition and its stories before anyone else can, so these
// go through the tables (RLS: editors only) rather than the public definer functions.

export type EditionRow = {
  id: string;
  slug: string;
  title: string;
  issue_month: string;
  cover_media_id: string | null;
  letter_html: string;
  status: "draft" | "published";
  supporters_from: string | null;
  public_from: string | null;
  pdf_path: string | null;
  pdf_generated_at: string | null;
  updated_at: string;
};

export const EDITION_COLUMNS = "id, slug, title, issue_month, cover_media_id, letter_html, status, supporters_from, public_from, pdf_path, pdf_generated_at, updated_at";

type ItemRow = {
  sort: number;
  article_id: string;
  articles: {
    id: string;
    slug: string;
    title: string;
    dek: string | null;
    body_html: string | null;
    status: string;
    published_at: string | null;
    sections: { slug: string; name: string } | { slug: string; name: string }[] | null;
    media: { storage_path: string; alt: string | null; credit: string | null } | { storage_path: string; alt: string | null; credit: string | null }[] | null;
  } | null;
};

const one = <T,>(value: T | T[] | null): T | null => (Array.isArray(value) ? (value[0] ?? null) : value);

// Items in order, with each story's live status so the builder can warn about ones that aren't published.
export async function editorItems(supabase: SupabaseClient, editionId: string) {
  const { data } = await supabase
    .from("edition_items")
    .select("sort, article_id, articles(id, slug, title, dek, body_html, status, published_at, sections(slug, name), media:media!articles_hero_media_id_fkey(storage_path, alt, credit))")
    .eq("edition_id", editionId)
    .order("sort")
    .returns<ItemRow[]>();
  const items = [];
  for (const row of data ?? []) {
    const article = row.articles;
    if (!article) continue;
    const section = one(article.sections);
    const hero = one(article.media);
    const live = article.status === "published" && !!article.published_at && article.published_at <= new Date().toISOString();
    items.push({ sort: row.sort, article, section, hero, live });
  }
  return items;
}

// The same shape the public reader and the PDF use, from the editor's view (drafts included).
export async function editorStories(supabase: SupabaseClient, editionId: string): Promise<EditionStory[]> {
  const items = await editorItems(supabase, editionId);
  const stories: EditionStory[] = [];
  for (const item of items) {
    if (!item.live || !item.section) continue;
    const { data: authors } = await supabase
      .from("article_authors")
      .select("sort, profiles(display_name)")
      .eq("article_id", item.article.id)
      .order("sort")
      .returns<{ sort: number; profiles: { display_name: string | null } | { display_name: string | null }[] | null }[]>();
    const byline = (authors ?? [])
      .map((a) => one(a.profiles)?.display_name?.trim() || "Eye Today contributor")
      .join(", ");
    stories.push({
      sort: item.sort,
      article_id: item.article.id,
      article_slug: item.article.slug,
      section_slug: item.section.slug,
      section_name: item.section.name,
      title: item.article.title,
      dek: item.article.dek,
      body_html: item.article.body_html,
      published_at: item.article.published_at!,
      hero_storage_path: item.hero?.storage_path ?? null,
      hero_alt: item.hero?.alt ?? null,
      hero_credit: item.hero?.credit ?? null,
      byline: byline || null,
    });
  }
  return stories;
}

export function toDetail(row: EditionRow, cover: { storage_path: string; alt: string | null } | null): EditionDetail {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    issue_month: row.issue_month,
    cover_storage_path: cover?.storage_path ?? null,
    cover_alt: cover?.alt ?? null,
    letter_html: row.letter_html,
    access: row.public_from && row.public_from <= new Date().toISOString() ? "public" : "early",
    public_from: row.public_from ?? new Date().toISOString(),
    pdf_path: row.pdf_path,
    pdf_generated_at: row.pdf_generated_at,
    updated_at: row.updated_at,
  };
}
