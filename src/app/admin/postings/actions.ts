"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { LONG_TOKENS, callClaude } from "@/lib/ai/claude";
import { PROMPT } from "@/lib/ai/prompts/claims";
import { claimsSchema } from "@/lib/ai/schemas";
import { getEditorContext } from "@/lib/auth/editor";
import { htmlToText } from "@/lib/events/ics";
import { parsePostingForm } from "@/lib/postings/form";
import { refreshPostings } from "@/lib/postings/revalidate";
import type { PostingKind } from "@/lib/postings/types";
import { SLUG_RE } from "@/lib/slug";

type Row = { id: string; kind: PostingKind; slug: string; status: string; listing_id: string | null };

async function load(ctx: NonNullable<Awaited<ReturnType<typeof getEditorContext>>>, id: string) {
  const { data } = await ctx.supabase.from("postings").select("id, kind, slug, status, listing_id").eq("id", id).maybeSingle<Row>();
  if (!data) return null;
  const { data: listing } = data.listing_id
    ? await ctx.supabase.from("directory_listings").select("slug").eq("id", data.listing_id).maybeSingle<{ slug: string }>()
    : { data: null };
  return { ...data, listingSlug: listing?.slug ?? null };
}

const reviewSchema = z.object({
  id: z.uuid(),
  action: z.enum(["approve", "reject", "unpublish"]),
  reason: z.string().trim().max(500),
  comp_days: z.string().trim(),
});

export async function reviewPosting(formData: FormData) {
  const ctx = await getEditorContext();
  if (!ctx) redirect("/login?next=/admin/postings");
  const parsed = reviewSchema.safeParse({
    id: formData.get("id") ?? "",
    action: formData.get("action") ?? "",
    reason: formData.get("reason") ?? "",
    comp_days: formData.get("comp_days") ?? "",
  });
  if (!parsed.success) redirect("/admin/postings?error=invalid");
  const { id, action, reason } = parsed.data;
  const back = String(formData.get("back") ?? "") === "detail" ? `/admin/postings/${id}` : "/admin/postings";
  const row = await load(ctx, id);
  if (!row) redirect("/admin/postings?error=not_found");

  if (action === "approve") {
    const comp = /^\d{1,3}$/.test(parsed.data.comp_days) ? Number(parsed.data.comp_days) : null;
    const { error } = await ctx.supabase.rpc("approve_posting", { p_id: id, p_comp_days: comp });
    if (error) redirect(`${back}?error=${error.message === "no paid time" ? "no_paid_time" : "save_failed"}`);
  } else if (action === "reject") {
    if (!reason) redirect(`${back}?error=reason`);
    const { error } = await ctx.supabase.from("postings").update({ status: "rejected", reject_reason: reason, reviewed_by: ctx.userId }).eq("id", id);
    if (error) redirect(`${back}?error=save_failed`);
  } else {
    if (row.status !== "published") redirect(`${back}?error=not_published`);
    const { error } = await ctx.supabase.from("postings").update({ status: "pending", reviewed_by: ctx.userId }).eq("id", id);
    if (error) redirect(`${back}?error=save_failed`);
  }
  refreshPostings({ kind: row.kind, slug: row.slug, listingSlug: row.listingSlug });
  redirect(`${back}?saved=${action}`);
}

export type SaveState = { error: string | null };

// Editors fix wording or details directly. The status is left alone.
export async function editPosting(_state: SaveState, formData: FormData): Promise<SaveState> {
  const ctx = await getEditorContext();
  if (!ctx) return { error: "Your session has expired. Sign in again." };
  const id = String(formData.get("id") ?? "");
  if (!z.uuid().safeParse(id).success) return { error: "That posting was not found." };
  const row = await load(ctx, id);
  if (!row) return { error: "That posting was not found." };
  const form = parsePostingForm(row.kind, formData);
  if (!form.ok) return { error: form.error };

  let listingId: string | null = null;
  if (form.data.listing_slug) {
    if (!SLUG_RE.test(form.data.listing_slug)) return { error: "That directory listing is not published." };
    const { data } = await ctx.supabase.from("directory_listings").select("id").eq("slug", form.data.listing_slug).eq("status", "published").maybeSingle<{ id: string }>();
    if (!data) return { error: "That directory listing is not published." };
    listingId = data.id;
  }
  // Same escaping as save_posting, done in the database so there is one implementation.
  const { data: html, error: htmlError } = await ctx.supabase.rpc("posting_description_preview", { p_text: form.data.description });
  if (htmlError || typeof html !== "string") return { error: "The posting could not be saved." };

  const d = form.data;
  const { error } = await ctx.supabase
    .from("postings")
    .update({
      title: d.title,
      organisation: d.organisation,
      listing_id: listingId,
      location: d.location || null,
      country_code: d.country || null,
      remote: d.remote,
      employment_type: d.employment_type,
      category: d.category,
      salary_min: d.salary_min,
      salary_max: d.salary_max,
      salary_currency: d.salary_currency,
      salary_period: d.salary_period,
      description_html: html,
      apply_url: d.apply_url || null,
      apply_email: d.apply_email || null,
      closing_date: d.closing_date,
    })
    .eq("id", id);
  if (error) return { error: "The posting could not be saved. Check the closing date and links." };
  refreshPostings({ kind: row.kind, slug: row.slug, listingSlug: row.listingSlug });
  redirect(`/admin/postings/${id}?saved=edit`);
}

export type ClaimFlag = { sentence: string; kind: string; reason: string };

// One lookup on an editor's click. Nothing is stored.
export async function checkPostingClaims(id: string): Promise<{ ok: true; items: ClaimFlag[] } | { ok: false; error: string }> {
  const ctx = await getEditorContext();
  if (!ctx) return { ok: false, error: "Your session has expired. Sign in again." };
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "That posting was not found." };
  const { data } = await ctx.supabase.from("postings").select("title, description_html").eq("id", id).maybeSingle<{ title: string; description_html: string }>();
  if (!data) return { ok: false, error: "That posting was not found." };
  const text = `${data.title}\n\n${htmlToText(data.description_html)}`.replace(/[<>]/g, "").slice(0, 6000);
  const result = await callClaude({ instructions: PROMPT, article: text, schema: claimsSchema, maxTokens: LONG_TOKENS });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, items: result.data.items };
}
