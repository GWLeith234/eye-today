"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getContributorContext } from "@/lib/auth/editor";
import { renderArticleHtml } from "@/lib/editor/render";
import { sendMail } from "@/lib/email/resend";
import { getSiteId } from "@/lib/site";
import { SLUG_RE } from "@/lib/slug";

export type ContributionResult =
  | { ok: true; id: string; status: string; warning?: string }
  | { ok: false; error: string; field?: "slug" | "title" | "body" | "disclosure" };

const optionalText = (max: number) => z.string().trim().max(max);

// Only these fields are read; anything else the client sends (publish, schedule,
// sponsored, authors, hero) is dropped by the schema.
const contributionSchema = z.object({
  id: z.uuid().optional(),
  intent: z.enum(["save", "submit"]),
  title: z.string().trim().min(1).max(200),
  dek: optionalText(400),
  slug: z.string().trim().min(1).max(120).regex(SLUG_RE),
  section_id: z.uuid(),
  tag_ids: z.array(z.uuid()).max(30),
  seo_title: optionalText(120),
  seo_description: optionalText(320),
  body_json: z.unknown(),
});

function dbError(error: { code?: string; message?: string }): ContributionResult {
  if (error.code === "23505") return { ok: false, field: "slug", error: "That slug is already used by another article." };
  if (error.message === "disclosure required") {
    return { ok: false, field: "disclosure", error: "Add your disclosure before submitting." };
  }
  if (error.code === "42501") return { ok: false, error: "This story can't be changed right now." };
  return { ok: false, error: "The story could not be saved." };
}

async function syncTags(supabase: SupabaseClient, articleId: string, siteId: string, ids: string[]) {
  const { data: existing, error } = await supabase.from("article_tags").select("tag_id").eq("article_id", articleId);
  if (error) return error;
  const current = (existing ?? []).map((row) => row.tag_id as string);
  const wanted = [...new Set(ids)];
  const toDelete = current.filter((id) => !wanted.includes(id));
  const toInsert = wanted.filter((id) => !current.includes(id));
  if (toDelete.length) {
    const { error: deleteError } = await supabase.from("article_tags").delete().eq("article_id", articleId).in("tag_id", toDelete);
    if (deleteError) return deleteError;
  }
  if (toInsert.length) {
    const { error: insertError } = await supabase
      .from("article_tags")
      .insert(toInsert.map((tag_id) => ({ article_id: articleId, tag_id, site_id: siteId })));
    if (insertError) return insertError;
  }
  return null;
}

export async function saveContribution(input: unknown): Promise<ContributionResult> {
  const ctx = await getContributorContext();
  if (!ctx) return { ok: false, error: "Only contributors can save stories here." };
  const { supabase, userId } = ctx;

  const parsed = contributionSchema.safeParse(input);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    if (field === "slug") return { ok: false, field: "slug", error: "Slugs use lowercase letters, numbers and hyphens." };
    if (field === "title") return { ok: false, field: "title", error: "A title is required (up to 200 characters)." };
    return { ok: false, error: "Some fields are missing or too long." };
  }
  const data = parsed.data;

  // Submit needs a disclosure; check first so nothing half-happens.
  if (data.intent === "submit") {
    const { data: disclosure } = await supabase.from("disclosures").select("id").eq("profile_id", userId).maybeSingle();
    if (!disclosure) return { ok: false, field: "disclosure", error: "Add your disclosure before submitting." };
  }

  let bodyHtml: string;
  try {
    bodyHtml = renderArticleHtml(data.body_json);
  } catch (error) {
    console.error("saveContribution: body_json rejected", error);
    return { ok: false, field: "body", error: "The story body could not be read." };
  }

  const { data: section } = await supabase.from("sections").select("site_id").eq("id", data.section_id).maybeSingle<{ site_id: string }>();
  const siteId = section?.site_id ?? (await getSiteId(supabase));
  if (!siteId) return { ok: false, error: "Choose a section." };

  const fields = {
    title: data.title,
    dek: data.dek || null,
    slug: data.slug,
    section_id: data.section_id,
    seo_title: data.seo_title || null,
    seo_description: data.seo_description || null,
    body_json: data.body_json,
    body_html: bodyHtml,
    is_sponsored: false,
    sponsor_name: null,
  };

  let articleId = data.id;
  if (articleId) {
    const { data: existing } = await supabase.from("articles").select("status").eq("id", articleId).maybeSingle<{ status: string }>();
    if (!existing) return { ok: false, error: "That story no longer exists." };
    if (existing.status !== "draft") return { ok: false, error: "This story is with the editors and can't be edited now." };

    const { data: updated, error } = await supabase.from("articles").update(fields).eq("id", articleId).eq("status", "draft").select("id");
    if (error) return dbError(error);
    if (!updated?.length) return { ok: false, error: "This story can't be edited by you." };
  } else {
    const { data: created, error } = await supabase
      .from("articles")
      .insert({ ...fields, site_id: siteId, status: "draft", created_by: userId })
      .select("id")
      .single<{ id: string }>();
    if (error || !created) return dbError(error ?? {});
    articleId = created.id;

    // The contributor is the single author; the list never changes after this.
    const { error: authorError } = await supabase
      .from("article_authors")
      .insert({ article_id: articleId, profile_id: userId, site_id: siteId, sort: 0 });
    if (authorError) {
      console.error("saveContribution: author row failed", authorError.code);
      return { ok: false, error: "The draft was created but you could not be added as its author. Contact an editor." };
    }
  }

  const tagError = await syncTags(supabase, articleId, siteId, data.tag_ids);
  if (tagError) return { ok: false, error: "The story was saved, but its tags could not be updated." };

  const { error: revisionError } = await supabase.from("article_revisions").insert({
    site_id: siteId,
    article_id: articleId,
    author_id: userId,
    body_json: data.body_json,
    body_html: bodyHtml,
    snapshot: {
      title: data.title,
      dek: data.dek,
      slug: data.slug,
      section_id: data.section_id,
      hero_media_id: null,
      seo_title: data.seo_title,
      seo_description: data.seo_description,
      tag_ids: data.tag_ids,
      author_ids: [userId],
    },
  });
  if (revisionError) return { ok: false, error: "The story was saved, but the revision could not be recorded." };

  if (data.intent === "save") return { ok: true, id: articleId, status: "draft" };

  // Submit: only from a current draft. The disclosure trigger is the database backstop.
  const { data: submitted, error: submitError } = await supabase
    .from("articles")
    .update({ status: "submitted" })
    .eq("id", articleId)
    .eq("status", "draft")
    .select("id");
  if (submitError) return dbError(submitError);
  if (!submitted?.length) return { ok: false, error: "This story could not be submitted." };

  const { data: editors } = await supabase.rpc("editor_emails");
  const mail = await sendMail({
    to: (editors ?? []) as string[],
    subject: `Story submitted for review: ${data.title}`,
    text: `A contributor submitted "${data.title}" for review.\n\nOpen the review queue in the Eye Today admin to read it.`,
  });

  return { ok: true, id: articleId, status: "submitted", warning: mail.ok ? undefined : mail.warning };
}

const disclosureSchema = z.string().trim().min(1).max(2000);

export async function saveDisclosure(formData: FormData) {
  const ctx = await getContributorContext();
  if (!ctx) redirect("/contribute");

  const text = disclosureSchema.safeParse(formData.get("text") ?? "");
  if (!text.success) redirect("/contribute/disclosure?error=invalid");

  const siteId = await getSiteId(ctx.supabase);
  if (!siteId) redirect("/contribute/disclosure?error=failed");

  const { error } = await ctx.supabase
    .from("disclosures")
    .upsert({ profile_id: ctx.userId, site_id: siteId, text: text.data }, { onConflict: "profile_id" });
  if (error) redirect(`/contribute/disclosure?error=${error.code === "23514" ? "invalid" : "failed"}`);

  redirect("/contribute/disclosure?saved=1");
}
