"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getEditorContext } from "@/lib/auth/editor";
import { parseSourceLines } from "@/lib/directory/sources";
import { getSiteId } from "@/lib/site";
import { isTrackerKind, parseKeyDateLines, trackerSlug } from "@/lib/tracker/model";

export type SaveState = { error: string | null };

const text = (max: number) => z.string().trim().max(max).transform((v) => v.replace(/[<>]/g, ""));

const schema = z.object({
  id: z.uuid().or(z.literal("")),
  kind: z.string(),
  title: z.string().trim().min(1).max(200).transform((v) => v.replace(/[<>]/g, "")),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80).or(z.literal("")),
  sponsor: text(160),
  stage: text(60),
  amount: text(80),
  jurisdiction: text(120),
  key_dates: z.string().max(2000),
  links: z.string().max(4000),
  notes: text(2000),
  article_id: z.uuid().or(z.literal("")),
  last_reviewed: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")),
  status: z.enum(["draft", "published"]),
  sort: z.coerce.number().int().min(0).max(999),
});

function refresh() {
  revalidatePath("/tracker");
  revalidatePath("/admin/tracker");
}

export async function saveTrackerEntry(_state: SaveState, formData: FormData): Promise<SaveState> {
  const ctx = await getEditorContext();
  if (!ctx) return { error: "Your session has expired. Sign in again." };
  const parsed = schema.safeParse({
    id: formData.get("id") ?? "",
    kind: formData.get("kind") ?? "",
    title: formData.get("title") ?? "",
    slug: formData.get("slug") ?? "",
    sponsor: formData.get("sponsor") ?? "",
    stage: formData.get("stage") ?? "",
    amount: formData.get("amount") ?? "",
    jurisdiction: formData.get("jurisdiction") ?? "",
    key_dates: formData.get("key_dates") ?? "",
    links: formData.get("links") ?? "",
    notes: formData.get("notes") ?? "",
    article_id: formData.get("article_id") ?? "",
    last_reviewed: formData.get("last_reviewed") ?? "",
    status: formData.get("status") ?? "draft",
    sort: formData.get("sort") ?? "0",
  });
  if (!parsed.success) return { error: "Check the title (up to 200 characters), slug (lowercase words and hyphens), dates and status." };
  if (!isTrackerKind(parsed.data.kind)) return { error: "Pick trial, funding or regulatory." };
  const slug = parsed.data.slug || trackerSlug(parsed.data.title);
  if (!slug) return { error: "The title needs some letters or numbers for the slug." };
  if (parsed.data.status === "published" && !parsed.data.last_reviewed) return { error: "Set the last-reviewed date before publishing." };

  const fields = {
    kind: parsed.data.kind,
    title: parsed.data.title,
    slug,
    sponsor: parsed.data.sponsor,
    stage: parsed.data.stage,
    amount: parsed.data.amount,
    jurisdiction: parsed.data.jurisdiction,
    key_dates: parseKeyDateLines(parsed.data.key_dates),
    links: parseSourceLines(parsed.data.links),
    notes: parsed.data.notes,
    article_id: parsed.data.article_id || null,
    last_reviewed: parsed.data.last_reviewed || null,
    status: parsed.data.status,
    sort: parsed.data.sort,
  };

  let id = parsed.data.id;
  if (id) {
    const { data, error } = await ctx.supabase.from("tracker_entries").update(fields).eq("id", id).select("id").maybeSingle<{ id: string }>();
    if (error) return { error: error.code === "23505" ? "Another entry already uses that slug." : "The entry could not be saved." };
    if (!data) return { error: "That entry could not be found." };
  } else {
    const siteId = await getSiteId(ctx.supabase);
    if (!siteId) return { error: "The site is not available." };
    const { data, error } = await ctx.supabase.from("tracker_entries").insert({ ...fields, site_id: siteId }).select("id").single<{ id: string }>();
    if (error) return { error: error.code === "23505" ? "Another entry already uses that slug." : "The entry could not be created." };
    id = data.id;
  }
  refresh();
  redirect(`/admin/tracker/${id}?saved=1`);
}

export async function deleteTrackerEntry(formData: FormData) {
  const ctx = await getEditorContext();
  if (!ctx) redirect("/login");
  const id = z.uuid().safeParse(String(formData.get("id") ?? ""));
  if (!id.success) redirect("/admin/tracker?error=notfound");
  await ctx.supabase.from("tracker_entries").delete().eq("id", id.data);
  refresh();
  redirect("/admin/tracker?done=deleted");
}
