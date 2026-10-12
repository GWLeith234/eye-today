import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { StoryChoice } from "./entry-form";

type Row = { id: string; title: string; status: string; sections: { name: string } | { name: string }[] | null };

// Published stories an entry can point at, newest first, plus the one already chosen if it is no longer published.
export async function storyChoices(supabase: SupabaseClient, keep: string | null): Promise<StoryChoice[]> {
  const { data } = await supabase
    .from("articles")
    .select("id, title, status, sections(name)")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(300)
    .returns<Row[]>();
  const rows = data ?? [];
  if (keep && !rows.some((row) => row.id === keep)) {
    const { data: chosen } = await supabase.from("articles").select("id, title, status, sections(name)").eq("id", keep).maybeSingle<Row>();
    if (chosen) rows.unshift(chosen);
  }
  return rows.map((row) => ({ id: row.id, title: row.title, section: (Array.isArray(row.sections) ? row.sections[0] : row.sections)?.name ?? "" }));
}
