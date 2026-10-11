"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getEditorContext } from "@/lib/auth/editor";
import { EDITION_COLUMNS, type EditionRow, editorStories, toDetail } from "@/lib/editions/admin";
import { editionSlug, monthDate, pdfObjectPath, supportersFrom } from "@/lib/editions/model";
import { pdfPageCount, renderEditionPdf } from "@/lib/editions/pdf";
import { letterHtml } from "@/lib/editions/letter";
import { absoluteUrl } from "@/lib/public/site";
import { getSiteId } from "@/lib/site";

export type SaveState = { error: string | null };

const schema = z.object({
  id: z.uuid().or(z.literal("")),
  title: z.string().trim().min(1).max(160),
  issue_month: z.string().trim(),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80).or(z.literal("")),
  cover_media_id: z.uuid().or(z.literal("")),
  letter: z.string().max(12000),
  status: z.enum(["draft", "published"]),
  public_from: z.string().trim(),
  early_days: z.coerce.number().int().min(0).max(30),
});

// datetime-local values are read as UTC, the same convention the polls and contests use.
function instant(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function saveEdition(_state: SaveState, formData: FormData): Promise<SaveState> {
  const ctx = await getEditorContext();
  if (!ctx) return { error: "Your session has expired. Sign in again." };
  const parsed = schema.safeParse({
    id: formData.get("id") ?? "",
    title: formData.get("title") ?? "",
    issue_month: formData.get("issue_month") ?? "",
    slug: formData.get("slug") ?? "",
    cover_media_id: formData.get("cover_media_id") ?? "",
    letter: formData.get("letter") ?? "",
    status: formData.get("status") ?? "",
    public_from: formData.get("public_from") ?? "",
    early_days: formData.get("early_days") ?? "0",
  });
  if (!parsed.success) return { error: "Check the title (up to 160 characters), month, slug (lowercase words and hyphens), status and dates." };
  const issueMonth = monthDate(parsed.data.issue_month);
  if (!issueMonth) return { error: "Pick the issue's month." };
  const publicFrom = instant(parsed.data.public_from);
  if (parsed.data.status === "published" && !publicFrom) return { error: "A published edition needs the date it goes public." };

  const storyIds = formData.getAll("story_id").map(String).filter((id) => z.uuid().safeParse(id).success);
  const unique = [...new Set(storyIds)].slice(0, 100);
  if (parsed.data.status === "published" && unique.length === 0) return { error: "Add at least one story before publishing." };

  // Every story must be published and due before the edition can be; a draft would otherwise disappear
  // from the reader without warning.
  if (unique.length > 0) {
    const { data: articles } = await ctx.supabase.from("articles").select("id, status, published_at").in("id", unique).returns<{ id: string; status: string; published_at: string | null }[]>();
    const found = new Map((articles ?? []).map((a) => [a.id, a]));
    if (found.size !== unique.length) return { error: "One of the selected stories no longer exists." };
    if (parsed.data.status === "published") {
      const now = new Date().toISOString();
      const notLive = unique.filter((id) => {
        const a = found.get(id)!;
        return a.status !== "published" || !a.published_at || a.published_at > now;
      });
      if (notLive.length > 0) return { error: `${notLive.length} selected ${notLive.length === 1 ? "story is" : "stories are"} not published yet. Publish them first or remove them.` };
    }
  }

  const fields = {
    title: parsed.data.title.replace(/[<>]/g, ""),
    slug: parsed.data.slug || editionSlug(issueMonth),
    issue_month: issueMonth,
    cover_media_id: parsed.data.cover_media_id || null,
    letter_html: letterHtml(parsed.data.letter),
    status: parsed.data.status,
    public_from: publicFrom,
    supporters_from: publicFrom ? supportersFrom(publicFrom, parsed.data.early_days) : null,
  };

  let editionId = parsed.data.id;
  let siteId: string | null = null;
  if (editionId) {
    const { data, error } = await ctx.supabase.from("editions").update(fields).eq("id", editionId).select("site_id").maybeSingle<{ site_id: string }>();
    if (error) return { error: error.code === "23505" ? "Another edition already uses that slug." : "The edition could not be saved." };
    if (!data) return { error: "The edition could not be saved." };
    siteId = data.site_id;
  } else {
    siteId = await getSiteId(ctx.supabase);
    if (!siteId) return { error: "The site is not available." };
    const { data, error } = await ctx.supabase.from("editions").insert({ ...fields, site_id: siteId, created_by: ctx.userId }).select("id").single<{ id: string }>();
    if (error) return { error: error.code === "23505" ? "An edition for that month (or slug) already exists." : "The edition could not be created." };
    editionId = data.id;
  }

  // Replace the item list in order. Sort values are unique per edition, so the old rows go first.
  const { error: clearError } = await ctx.supabase.from("edition_items").delete().eq("edition_id", editionId);
  if (clearError) return { error: "The story list could not be saved." };
  if (unique.length > 0) {
    const rows = unique.map((article_id, sort) => ({ site_id: siteId, edition_id: editionId, article_id, sort }));
    const { error } = await ctx.supabase.from("edition_items").insert(rows);
    if (error) return { error: "The story list could not be saved." };
  }

  revalidatePath("/sitemap.xml");
  redirect(`/admin/editions/${editionId}?saved=1`);
}

export type PdfState = { error: string | null; pages?: number };

// Renders the PDF from the editor's view of the edition (drafts included), stores it under a fresh
// object name and records it on the edition. Only published, due stories are included.
export async function generatePdf(_state: PdfState, formData: FormData): Promise<PdfState> {
  const ctx = await getEditorContext();
  if (!ctx) return { error: "Your session has expired. Sign in again." };
  const id = String(formData.get("id") ?? "");
  if (!z.uuid().safeParse(id).success) return { error: "That edition could not be found." };

  const { data: row } = await ctx.supabase.from("editions").select(EDITION_COLUMNS).eq("id", id).maybeSingle<EditionRow>();
  if (!row) return { error: "That edition could not be found." };
  const { data: cover } = row.cover_media_id
    ? await ctx.supabase.from("media").select("storage_path, alt").eq("id", row.cover_media_id).maybeSingle<{ storage_path: string; alt: string | null }>()
    : { data: null };
  const stories = await editorStories(ctx.supabase, id);
  if (stories.length === 0) return { error: "Add at least one published story before generating the PDF." };

  let bytes: Buffer;
  try {
    bytes = await renderEditionPdf({ edition: toDetail(row, cover ?? null), stories, siteUrl: absoluteUrl("/").replace(/\/$/, "") });
  } catch (error) {
    console.error("edition pdf render failed", error instanceof Error ? error.message : error);
    return { error: "The PDF could not be rendered. Check the stories' images and try again." };
  }
  const pages = pdfPageCount(bytes);
  if (pages < 3) return { error: "The PDF came out incomplete and was not saved." };

  const objectPath = pdfObjectPath(id);
  const bucket = ctx.supabase.storage.from("editions");
  const { error: uploadError } = await bucket.upload(objectPath, bytes, { contentType: "application/pdf", cacheControl: "0", upsert: false });
  if (uploadError) return { error: "The PDF could not be stored." };
  const { error: updateError } = await ctx.supabase
    .from("editions")
    .update({ pdf_path: objectPath, pdf_generated_at: new Date().toISOString() })
    .eq("id", id);
  if (updateError) return { error: "The PDF was stored but the edition could not be updated." };
  if (row.pdf_path && row.pdf_path !== objectPath) await bucket.remove([row.pdf_path]);

  return { error: null, pages };
}
