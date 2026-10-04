"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { getEditorContext } from "@/lib/auth/editor";
import { renderArticleHtml } from "@/lib/editor/render";
import { revalidatePublic } from "@/lib/public/revalidate";
import { getSiteId } from "@/lib/site";
import { SLUG_RE } from "@/lib/slug";

export type SaveIntent = "save" | "schedule" | "publish" | "unpublish";

export type SaveResult =
  | { ok: true; id: string; status: string }
  | { ok: false; error: string; field?: "slug" | "sponsor_name" | "scheduled_for" | "body" | "title" };

const optionalText = (max: number) => z.string().trim().max(max);

const snapshotSchema = z.object({
  title: z.string().trim().min(1).max(200),
  dek: optionalText(400),
  slug: z.string().trim().min(1).max(120).regex(SLUG_RE),
  section_id: z.uuid(),
  hero_media_id: z.uuid().nullable(),
  seo_title: optionalText(120),
  seo_description: optionalText(320),
  tag_ids: z.array(z.uuid()).max(30),
  author_ids: z.array(z.uuid()).max(10),
});

type Snapshot = z.infer<typeof snapshotSchema>;

const saveSchema = snapshotSchema.extend({
  id: z.uuid().optional(),
  intent: z.enum(["save", "schedule", "publish", "unpublish"]),
  is_sponsored: z.boolean(),
  comments_enabled: z.boolean().optional(),
  sponsor_name: optionalText(120),
  sponsor_logo_media_id: z.uuid().nullable().optional(),
  scheduled_for: z.iso.datetime({ offset: true }).nullable(),
  body_json: z.unknown(),
});

function dbError(error: { code?: string; message?: string }): SaveResult {
  if (error.code === "23505") return { ok: false, field: "slug", error: "That slug is already used by another article." };
  if (error.code === "23514" && error.message?.includes("articles_sponsored_has_sponsor")) {
    return { ok: false, field: "sponsor_name", error: "Sponsored articles need a sponsor name." };
  }
  if (error.code === "23514" && error.message?.includes("articles_scheduled_has_date")) {
    return { ok: false, field: "scheduled_for", error: "Pick a date and time to schedule." };
  }
  if (error.code === "42501") return { ok: false, error: "You don't have permission to make that change." };
  return { ok: false, error: "The article could not be saved." };
}

// Replace an article's tags or authors with exactly `ids` (authors keep order).
async function syncLinks(
  supabase: SupabaseClient,
  table: "article_tags" | "article_authors",
  articleId: string,
  siteId: string,
  ids: string[],
) {
  const column = table === "article_tags" ? "tag_id" : "profile_id";
  const { data: existing, error } = await supabase.from(table).select(column).eq("article_id", articleId);
  if (error) return error;
  const current = (existing ?? []).map((row) => (row as Record<string, string>)[column]);
  const unique = [...new Set(ids)];

  const orderMatters = table === "article_authors";
  const same = current.length === unique.length && (orderMatters ? current.every((v, i) => v === unique[i]) : unique.every((v) => current.includes(v)));
  if (same) return null;

  const toDelete = orderMatters ? current : current.filter((v) => !unique.includes(v));
  const toInsert = orderMatters ? unique : unique.filter((v) => !current.includes(v));

  if (toDelete.length) {
    const { error: deleteError } = await supabase.from(table).delete().eq("article_id", articleId).in(column, toDelete);
    if (deleteError) return deleteError;
  }
  if (toInsert.length) {
    const rows = toInsert.map((value) => ({
      article_id: articleId,
      site_id: siteId,
      [column]: value,
      ...(orderMatters ? { sort: unique.indexOf(value) } : {}),
    }));
    const { error: insertError } = await supabase.from(table).insert(rows);
    if (insertError) return insertError;
  }
  return null;
}

function snapshotOf(input: Snapshot): Snapshot {
  return {
    title: input.title,
    dek: input.dek,
    slug: input.slug,
    section_id: input.section_id,
    hero_media_id: input.hero_media_id,
    seo_title: input.seo_title,
    seo_description: input.seo_description,
    tag_ids: input.tag_ids,
    author_ids: input.author_ids,
  };
}

export async function saveArticle(input: unknown): Promise<SaveResult> {
  const ctx = await getEditorContext();
  if (!ctx) return { ok: false, error: "Only editors can save articles." };
  const { supabase, userId } = ctx;

  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path[0];
    if (field === "slug") return { ok: false, field: "slug", error: "Slugs use lowercase letters, numbers and hyphens." };
    if (field === "title") return { ok: false, field: "title", error: "A title is required (up to 200 characters)." };
    if (field === "scheduled_for") return { ok: false, field: "scheduled_for", error: "That schedule time is not valid." };
    return { ok: false, error: "Some fields are missing or too long." };
  }
  const data = parsed.data;

  // Build HTML on the server from the JSON only. The browser's HTML is never used.
  let bodyHtml: string;
  try {
    bodyHtml = renderArticleHtml(data.body_json);
  } catch (error) {
    console.error("saveArticle: body_json rejected", error);
    return { ok: false, field: "body", error: "The article body could not be read." };
  }

  const { data: section } = await supabase.from("sections").select("site_id").eq("id", data.section_id).maybeSingle<{ site_id: string }>();
  const siteId = section?.site_id ?? (await getSiteId(supabase));
  if (!siteId) return { ok: false, error: "Choose a section." };

  let currentStatus = "draft";
  let previous: { section?: string | null; slug?: string | null } = {};
  if (data.id) {
    const { data: existing } = await supabase
      .from("articles")
      .select("status, slug, sections(slug)")
      .eq("id", data.id)
      .maybeSingle<{ status: string; slug: string; sections: { slug: string } | null }>();
    if (!existing) return { ok: false, error: "That article no longer exists." };
    currentStatus = existing.status;
    previous = { section: existing.sections?.slug, slug: existing.slug };
  }

  const row: Record<string, unknown> = {
    title: data.title,
    dek: data.dek || null,
    slug: data.slug,
    section_id: data.section_id,
    hero_media_id: data.hero_media_id,
    is_sponsored: data.is_sponsored,
    ...(data.comments_enabled === undefined ? {} : { comments_enabled: data.comments_enabled }),
    sponsor_name: data.sponsor_name || null,
    // Only a sponsored story carries a sponsor logo.
    sponsor_logo_media_id: data.is_sponsored ? (data.sponsor_logo_media_id ?? null) : null,
    seo_title: data.seo_title || null,
    seo_description: data.seo_description || null,
    body_json: data.body_json,
    body_html: bodyHtml,
  };

  switch (data.intent) {
    case "save":
      row.status = data.id ? currentStatus : "draft";
      break;
    case "schedule":
      if (!data.scheduled_for) return { ok: false, field: "scheduled_for", error: "Pick a date and time to schedule." };
      if (new Date(data.scheduled_for).getTime() <= Date.now()) {
        return { ok: false, field: "scheduled_for", error: "Schedule a time in the future, or publish now." };
      }
      row.status = "scheduled";
      row.scheduled_for = data.scheduled_for;
      break;
    case "publish":
      row.status = "published";
      row.published_at = new Date().toISOString();
      break;
    case "unpublish":
      row.status = "draft"; // published_at is kept on purpose
      break;
  }

  let articleId = data.id;
  if (articleId) {
    const { error } = await supabase.from("articles").update(row).eq("id", articleId);
    if (error) return dbError(error);
  } else {
    const { data: created, error } = await supabase
      .from("articles")
      .insert({ ...row, site_id: siteId })
      .select("id")
      .single<{ id: string }>();
    if (error || !created) return dbError(error ?? {});
    articleId = created.id;
  }

  const linkError =
    (await syncLinks(supabase, "article_tags", articleId, siteId, data.tag_ids)) ??
    (await syncLinks(supabase, "article_authors", articleId, siteId, data.author_ids));
  if (linkError) return { ok: false, error: "Saved, but tags or authors could not be updated." };

  const { error: revisionError } = await supabase.from("article_revisions").insert({
    site_id: siteId,
    article_id: articleId,
    author_id: userId,
    body_json: data.body_json,
    body_html: bodyHtml,
    snapshot: snapshotOf(data),
  });
  if (revisionError) return { ok: false, error: "Saved, but the revision could not be recorded." };

  // Drafts never reach the public site; anything that is or was live does.
  if (currentStatus !== "draft" || row.status !== "draft") {
    const { data: section } = await supabase.from("sections").select("slug").eq("id", data.section_id).maybeSingle<{ slug: string }>();
    revalidatePublic(previous, { section: section?.slug, slug: data.slug });
  }

  return { ok: true, id: articleId, status: String(row.status) };
}

const restoreSchema = z.object({ articleId: z.uuid(), revisionId: z.uuid() });

// Copies a revision's snapshot and body back onto the article, then records a
// new revision. The old revision row is never modified.
export async function restoreRevision(input: unknown): Promise<SaveResult> {
  const ctx = await getEditorContext();
  if (!ctx) return { ok: false, error: "Only editors can restore revisions." };
  const { supabase, userId } = ctx;

  const parsed = restoreSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Unknown revision." };
  const { articleId, revisionId } = parsed.data;

  const { data: revision } = await supabase
    .from("article_revisions")
    .select("site_id, body_json, snapshot")
    .eq("id", revisionId)
    .eq("article_id", articleId)
    .maybeSingle<{ site_id: string; body_json: unknown; snapshot: unknown }>();
  if (!revision) return { ok: false, error: "That revision was not found." };

  const snapshot = snapshotSchema.safeParse(revision.snapshot);
  if (!snapshot.success) return { ok: false, error: "That revision has no restorable snapshot." };

  let bodyHtml: string;
  try {
    bodyHtml = renderArticleHtml(revision.body_json);
  } catch {
    return { ok: false, error: "That revision's body could not be read." };
  }

  const s = snapshot.data;
  const { data: updated, error } = await supabase
    .from("articles")
    .update({
      title: s.title,
      dek: s.dek || null,
      slug: s.slug,
      section_id: s.section_id,
      hero_media_id: s.hero_media_id,
      seo_title: s.seo_title || null,
      seo_description: s.seo_description || null,
      body_json: revision.body_json,
      body_html: bodyHtml,
    })
    .eq("id", articleId)
    .select("status")
    .single<{ status: string }>();
  if (error || !updated) return dbError(error ?? {});

  const linkError =
    (await syncLinks(supabase, "article_tags", articleId, revision.site_id, s.tag_ids)) ??
    (await syncLinks(supabase, "article_authors", articleId, revision.site_id, s.author_ids));
  if (linkError) return { ok: false, error: "Restored, but tags or authors could not be updated." };

  const { error: revisionError } = await supabase.from("article_revisions").insert({
    site_id: revision.site_id,
    article_id: articleId,
    author_id: userId,
    body_json: revision.body_json,
    body_html: bodyHtml,
    snapshot: s,
  });
  if (revisionError) return { ok: false, error: "Restored, but the new revision could not be recorded." };

  if (updated.status !== "draft") {
    const { data: section } = await supabase.from("sections").select("slug").eq("id", s.section_id).maybeSingle<{ slug: string }>();
    revalidatePublic({ section: section?.slug, slug: s.slug });
  }

  return { ok: true, id: articleId, status: updated.status };
}
