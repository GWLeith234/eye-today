import type { SupabaseClient } from "@supabase/supabase-js";

import { issueLabel } from "@/lib/editions/model";
import { mediaUrl } from "@/lib/media/url";

import { siteOrigin } from "./urls";

// "This month's issue": the newest edition everyone can read today. Early-access editions are left out,
// since the email goes to readers who may not be supporters. Missing: the section is left out.

export type EditionItem = { title: string; label: string; url: string; storyCount: number; coverUrl: string | null };

type Row = { slug: string; title: string; issue_month: string; cover_storage_path: string | null; access: string; story_count: number };

export async function currentEdition(supabase: SupabaseClient, siteUrl: string): Promise<EditionItem | null> {
  const { data, error } = await supabase.rpc("editions_public");
  if (error) return null;
  const row = ((data as Row[] | null) ?? []).find((r) => r.access === "public");
  if (!row) return null;
  return {
    title: row.title,
    label: issueLabel(row.issue_month),
    url: `${siteOrigin(siteUrl)}/editions/${row.slug}`,
    storyCount: row.story_count,
    coverUrl: row.cover_storage_path ? mediaUrl(row.cover_storage_path, { width: 600 }) : null,
  };
}
