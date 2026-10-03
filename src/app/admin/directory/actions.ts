"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { LONG_TOKENS, callClaude } from "@/lib/ai/claude";
import { PROMPT } from "@/lib/ai/prompts/claims";
import { claimsSchema } from "@/lib/ai/schemas";
import { loginPath } from "@/lib/auth/access";
import { getEditorContext } from "@/lib/auth/editor";
import { splitTags } from "@/lib/directory/query";
import { parseSourceLines } from "@/lib/directory/sources";
import { LISTING_STATUSES, VERIFICATION_LEVELS } from "@/lib/directory/types";
import { rateLimit } from "@/lib/http/rate-limit";
import { sanitizeLegalHtml } from "@/lib/public/content-doc";
import { getSiteId } from "@/lib/site";
import { SLUG_RE, slugify } from "@/lib/slug";

export type SaveState = { error: string | null };

export type ClaimFlag = { sentence: string; kind: string; reason: string };

const listingSchema = z.object({
  id: z.uuid().or(z.literal("")),
  name: z.string().trim().min(1).max(160),
  slug: z.string().trim().regex(SLUG_RE),
  category_id: z.uuid(),
  country_code: z.string().trim().regex(/^[A-Za-z]{2}$/),
  region: z.string().trim().max(80),
  city: z.string().trim().max(80),
  services: z.string().max(1000),
  languages: z.string().max(500),
  website: z.string().trim().max(300).refine((value) => value === "" || /^https:\/\/\S+$/.test(value)),
  public_email: z.string().trim().max(254).refine((value) => value === "" || z.email().safeParse(value).success),
  public_phone: z.string().trim().max(40),
  description: z.string().max(2000),
  logo_media_id: z.string(),
  verification_level: z.enum(VERIFICATION_LEVELS),
  verification_note: z.string().trim().min(1).max(500),
  relationship_disclosure: z.string().trim().max(1000),
  last_reviewed_at: z.string().trim(),
  status: z.enum(LISTING_STATUSES),
});

function blank(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function refreshListing(country: string, slug: string) {
  revalidatePath("/directory");
  revalidatePath(`/directory/${country.toLowerCase()}`);
  revalidatePath(`/directory/listing/${slug}`);
  revalidatePath("/sitemap.xml");
}

export async function saveListing(_state: SaveState, formData: FormData): Promise<SaveState> {
  const ctx = await getEditorContext();
  if (!ctx) return { error: "Your session has expired. Sign in again." };

  const parsed = listingSchema.safeParse({
    id: formData.get("id") ?? "",
    name: formData.get("name") ?? "",
    slug: formData.get("slug") ?? "",
    category_id: formData.get("category_id") ?? "",
    country_code: formData.get("country_code") ?? "",
    region: formData.get("region") ?? "",
    city: formData.get("city") ?? "",
    services: formData.get("services") ?? "",
    languages: formData.get("languages") ?? "",
    website: formData.get("website") ?? "",
    public_email: formData.get("public_email") ?? "",
    public_phone: formData.get("public_phone") ?? "",
    description: formData.get("description") ?? "",
    logo_media_id: formData.get("logo_media_id") ?? "",
    verification_level: formData.get("verification_level") ?? "",
    verification_note: formData.get("verification_note") ?? "",
    relationship_disclosure: formData.get("relationship_disclosure") ?? "",
    last_reviewed_at: formData.get("last_reviewed_at") ?? "",
    status: formData.get("status") ?? "",
  });
  if (!parsed.success) {
    return { error: "Check the listing fields. A verification note is required, and a website must start with https://." };
  }
  if (parsed.data.status === "published" && parsed.data.description.trim().length === 0) {
    return { error: "A published listing needs a description." };
  }

  const photos = formData
    .getAll("photos")
    .filter((value): value is string => typeof value === "string" && z.uuid().safeParse(value).success)
    .slice(0, 8);
  const logo = z.uuid().safeParse(parsed.data.logo_media_id).success ? parsed.data.logo_media_id : null;

  const { data: category } = await ctx.supabase
    .from("directory_categories")
    .select("site_id")
    .eq("id", parsed.data.category_id)
    .maybeSingle<{ site_id: string }>();
  if (!category) return { error: "Choose a category." };

  let reviewed: string | null = null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(parsed.data.last_reviewed_at)) reviewed = `${parsed.data.last_reviewed_at}T00:00:00.000Z`;
  else if (parsed.data.status === "published") reviewed = new Date().toISOString();

  const row = {
    site_id: category.site_id,
    category_id: parsed.data.category_id,
    slug: parsed.data.slug,
    name: parsed.data.name,
    country_code: parsed.data.country_code.toUpperCase(),
    region: blank(parsed.data.region),
    city: blank(parsed.data.city),
    services: splitTags(parsed.data.services),
    languages: splitTags(parsed.data.languages),
    website: blank(parsed.data.website),
    public_email: blank(parsed.data.public_email)?.toLowerCase() ?? null,
    public_phone: blank(parsed.data.public_phone),
    description: parsed.data.description.trim().replace(/[<>]/g, ""),
    logo_media_id: logo,
    photo_media_ids: photos,
    status: parsed.data.status,
    verification_level: parsed.data.verification_level,
    verification_note: parsed.data.verification_note,
    relationship_disclosure: blank(parsed.data.relationship_disclosure),
    last_reviewed_at: reviewed,
  };

  const id = parsed.data.id;
  const result = id
    ? await ctx.supabase.from("directory_listings").update(row).eq("id", id).select("id").maybeSingle<{ id: string }>()
    : await ctx.supabase.from("directory_listings").insert(row).select("id").maybeSingle<{ id: string }>();

  if (result.error || !result.data) {
    console.error("directory save failed", result.error?.code);
    if (result.error?.code === "23505") return { error: "That slug is already used." };
    return { error: "The listing could not be saved." };
  }

  refreshListing(row.country_code, row.slug);
  redirect(`/admin/directory/${result.data.id}?saved=1`);
}

export async function checkListingClaims(description: string): Promise<{ ok: true; items: ClaimFlag[] } | { ok: false; error: string }> {
  const ctx = await getEditorContext();
  if (!ctx) return { ok: false, error: "Your session has expired. Sign in again." };
  const text = description.replace(/[<>]/g, "").trim().slice(0, 2000);
  if (!text) return { ok: false, error: "Write a description before checking claims." };
  if (!rateLimit(`directory-claims:${ctx.userId}`, 20, 60_000)) {
    return { ok: false, error: "The claims check is paused for a minute. Nothing was changed." };
  }

  const result = await callClaude({
    instructions: PROMPT,
    article: text,
    schema: claimsSchema,
    maxTokens: LONG_TOKENS,
  });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, items: result.data.items };
}

function textField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export async function acceptSubmission(formData: FormData) {
  const ctx = await getEditorContext();
  if (!ctx) redirect(loginPath("/admin/directory"));
  const id = String(formData.get("id") ?? "");
  if (!z.uuid().safeParse(id).success) redirect("/admin/directory?error=invalid");

  const { data: submission } = await ctx.supabase
    .from("listing_submissions")
    .select("id, status, payload, site_id")
    .eq("id", id)
    .maybeSingle<{ id: string; status: string; payload: Record<string, unknown> | null; site_id: string }>();
  if (!submission) redirect("/admin/directory?error=not_found");
  if (submission.status !== "pending") redirect("/admin/directory?error=not_pending");

  const payload = submission.payload ?? {};
  const name = textField(payload.name).trim().slice(0, 160);
  const categorySlug = textField(payload.category_slug);
  const country = textField(payload.country_code).toUpperCase();
  if (!name || !/^[A-Z]{2}$/.test(country)) redirect("/admin/directory?error=invalid");

  const { data: category } = await ctx.supabase
    .from("directory_categories")
    .select("id")
    .eq("site_id", submission.site_id)
    .eq("slug", categorySlug)
    .maybeSingle<{ id: string }>();
  if (!category) redirect("/admin/directory?error=no_category");

  const base = (slugify(name) || "listing").slice(0, 100);
  let slug = base;
  for (let n = 2; n < 50; n += 1) {
    const { data: existing } = await ctx.supabase
      .from("directory_listings")
      .select("id")
      .eq("site_id", submission.site_id)
      .eq("slug", slug)
      .maybeSingle<{ id: string }>();
    if (!existing) break;
    slug = `${base}-${n}`;
  }

  const website = textField(payload.website);
  const { data: created, error } = await ctx.supabase
    .from("directory_listings")
    .insert({
      site_id: submission.site_id,
      category_id: category.id,
      slug,
      name,
      country_code: country,
      region: textField(payload.region) || null,
      city: textField(payload.city) || null,
      services: splitTags(textField(payload.services)),
      languages: splitTags(textField(payload.languages)),
      website: /^https:\/\/\S+$/.test(website) ? website : null,
      public_email: textField(payload.public_email).toLowerCase() || null,
      public_phone: textField(payload.public_phone) || null,
      description: textField(payload.description).replace(/[<>]/g, ""),
      status: "draft",
      verification_level: "listed",
      verification_note: "Created from a public submission. Not yet reviewed.",
    })
    .select("id")
    .maybeSingle<{ id: string }>();
  if (error || !created) {
    console.error("directory accept failed", error?.code);
    redirect("/admin/directory?error=save_failed");
  }

  const { error: reviewError } = await ctx.supabase
    .from("listing_submissions")
    .update({ status: "accepted", listing_id: created.id, reviewed_by: ctx.userId })
    .eq("id", submission.id)
    .eq("status", "pending");
  if (reviewError) console.error("directory accept review failed", reviewError.code);

  revalidatePath("/admin/directory");
  redirect(`/admin/directory/${created.id}?created=1`);
}

export async function rejectSubmission(formData: FormData) {
  const ctx = await getEditorContext();
  if (!ctx) redirect(loginPath("/admin/directory"));
  const id = String(formData.get("id") ?? "");
  if (!z.uuid().safeParse(id).success) redirect("/admin/directory?error=invalid");
  const { error } = await ctx.supabase
    .from("listing_submissions")
    .update({ status: "rejected", reviewed_by: ctx.userId })
    .eq("id", id)
    .eq("status", "pending");
  if (error) redirect("/admin/directory?error=save_failed");
  redirect("/admin/directory?saved=rejected");
}

export async function updateCategory(formData: FormData) {
  const ctx = await getEditorContext();
  if (!ctx) redirect(loginPath("/admin/directory"));
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const sort = Number(formData.get("sort"));
  const hidden = formData.get("hidden") === "yes";
  if (!z.uuid().safeParse(id).success || name.length < 1 || name.length > 80 || !Number.isInteger(sort) || sort < 0 || sort > 9999) {
    redirect("/admin/directory?error=invalid");
  }
  const { error } = await ctx.supabase.from("directory_categories").update({ name, sort, hidden }).eq("id", id);
  if (error) redirect("/admin/directory?error=save_failed");
  revalidatePath("/directory");
  redirect("/admin/directory?saved=category");
}

export async function openLegal(formData: FormData) {
  const ctx = await getEditorContext();
  if (!ctx) redirect(loginPath("/admin/directory"));
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) redirect("/admin/directory?error=invalid");
  redirect(`/admin/directory/legal/${code}`);
}

export async function saveLegal(_state: SaveState, formData: FormData): Promise<SaveState> {
  const ctx = await getEditorContext();
  if (!ctx) return { error: "Your session has expired. Sign in again." };
  const siteId = await getSiteId(ctx.supabase);
  if (!siteId) return { error: "The site is not available." };

  const code = String(formData.get("country_code") ?? "").trim().toUpperCase();
  const title = String(formData.get("title") ?? "").trim().slice(0, 160);
  const html = sanitizeLegalHtml(String(formData.get("summary_html") ?? "")).slice(0, 20000);
  const sources = parseSourceLines(String(formData.get("sources") ?? ""));
  const asOf = String(formData.get("as_of") ?? "").trim();
  const status = formData.get("status") === "published" ? "published" : "draft";
  if (!/^[A-Z]{2}$/.test(code)) return { error: "Use a two-letter country code." };
  const text = html.replace(/<[^>]*>/g, "").trim();
  if (status === "published" && (!title || !text || !/^\d{4}-\d{2}-\d{2}$/.test(asOf) || sources.length === 0)) {
    return { error: "Publishing needs a title, a summary, an as-of date and at least one https source." };
  }

  const { error } = await ctx.supabase.from("country_legal_status").upsert(
    {
      site_id: siteId,
      country_code: code,
      title,
      summary_html: html,
      sources,
      as_of: /^\d{4}-\d{2}-\d{2}$/.test(asOf) ? asOf : null,
      status,
    },
    { onConflict: "site_id,country_code" },
  );
  if (error) {
    console.error("directory legal save failed", error.code);
    return { error: "The legal-status page could not be saved." };
  }
  revalidatePath(`/directory/${code.toLowerCase()}`);
  revalidatePath("/sitemap.xml");
  redirect(`/admin/directory/legal/${code}?saved=1`);
}
