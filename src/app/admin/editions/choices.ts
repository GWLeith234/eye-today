import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { CoverChoice, StoryChoice } from "./edition-form";

type ArticleRow = { id: string; title: string; status: string; published_at: string | null; sections: { name: string } | { name: string }[] | null };
type MediaRow = { id: string; storage_path: string; alt: string | null };

const one = <T,>(value: T | T[] | null): T | null => (Array.isArray(value) ? (value[0] ?? null) : value);

// Stories an editor can put in an issue: the newest published ones, plus any already in this edition
// (so a story that was unpublished since still shows, flagged).
export async function storyChoices(supabase: SupabaseClient, includeIds: string[]): Promise<StoryChoice[]> {
  const now = new Date().toISOString();
  const { data: recent } = await supabase
    .from("articles")
    .select("id, title, status, published_at, sections(name)")
    .eq("status", "published")
    .lte("published_at", now)
    .order("published_at", { ascending: false })
    .limit(150)
    .returns<ArticleRow[]>();
  const rows = [...(recent ?? [])];
  const missing = includeIds.filter((id) => !rows.some((row) => row.id === id));
  if (missing.length > 0) {
    const { data: extra } = await supabase.from("articles").select("id, title, status, published_at, sections(name)").in("id", missing).returns<ArticleRow[]>();
    rows.push(...(extra ?? []));
  }
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    section: one(row.sections)?.name ?? "",
    live: row.status === "published" && !!row.published_at && row.published_at <= now,
    published_at: row.published_at,
  }));
}

// The newest images, plus the edition's current cover so an older one is never cleared by a save.
export async function coverChoices(supabase: SupabaseClient, currentId: string | null = null): Promise<CoverChoice[]> {
  const { data } = await supabase.from("media").select("id, storage_path, alt").order("created_at", { ascending: false }).limit(100).returns<MediaRow[]>();
  const rows = [...(data ?? [])];
  if (currentId && !rows.some((row) => row.id === currentId)) {
    const { data: current } = await supabase.from("media").select("id, storage_path, alt").eq("id", currentId).maybeSingle<MediaRow>();
    if (current) rows.unshift(current);
  }
  return rows.map((row) => ({ id: row.id, label: row.alt?.trim() ? `${row.alt} (${row.storage_path.split("/").pop()})` : row.storage_path }));
}
