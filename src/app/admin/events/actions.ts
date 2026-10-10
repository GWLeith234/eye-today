"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { getEditorContext, type EditorContext } from "@/lib/auth/editor";
import { parseEventForm } from "@/lib/events/form";
import { refreshEvent } from "@/lib/events/revalidate";
import { sanitizeLegalHtml } from "@/lib/public/content-doc";
import { getSiteId } from "@/lib/site";
import { SLUG_RE } from "@/lib/slug";

export type SaveState = { error: string | null };

type Row = { id: string; slug: string; listing_id: string | null; status: string };

async function load(ctx: EditorContext, id: string): Promise<(Row & { listing_slug: string | null }) | null> {
  const { data } = await ctx.supabase.from("events").select("id, slug, listing_id, status").eq("id", id).maybeSingle<Row>();
  if (!data) return null;
  return { ...data, listing_slug: await listingSlug(ctx, data.listing_id) };
}

async function listingSlug(ctx: EditorContext, listingId: string | null): Promise<string | null> {
  if (!listingId) return null;
  const { data } = await ctx.supabase.from("directory_listings").select("slug").eq("id", listingId).maybeSingle<{ slug: string }>();
  return data?.slug ?? null;
}

async function listingIdFor(ctx: EditorContext, slug: string): Promise<{ ok: true; id: string | null } | { ok: false }> {
  if (!slug) return { ok: true, id: null };
  if (!SLUG_RE.test(slug)) return { ok: false };
  const { data } = await ctx.supabase
    .from("directory_listings")
    .select("id")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle<{ id: string }>();
  return data ? { ok: true, id: data.id } : { ok: false };
}

function promotedUntil(value: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T23:59:59.000Z` : null;
}

// Editors create or edit any event. Status changes go through the review actions below.
export async function saveEvent(_state: SaveState, formData: FormData): Promise<SaveState> {
  const ctx = await getEditorContext();
  if (!ctx) return { error: "Your session has expired. Sign in again." };

  const id = String(formData.get("id") ?? "");
  const form = parseEventForm(formData);
  if (!form.ok) return { error: form.error };
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  if (!SLUG_RE.test(slug) || slug === "submit" || slug.length > 120) return { error: "Use a lowercase slug with hyphens (not “submit”)." };
  const listing = await listingIdFor(ctx, form.data.listing_slug);
  if (!listing.ok) return { error: "That directory listing is not published. Leave it blank or use a published listing’s slug." };

  const image = String(formData.get("image_media_id") ?? "");
  const html = sanitizeLegalHtml(String(formData.get("description_html") ?? "")).slice(0, 40000);
  const note = String(formData.get("editor_note") ?? "").trim().slice(0, 500);
  const promoted = promotedUntil(String(formData.get("promoted_until") ?? "").trim());

  const fields = {
    slug,
    title: form.data.title,
    event_type: form.data.event_type,
    attendance: form.data.attendance,
    starts_at: form.data.starts_at,
    ends_at: form.data.ends_at,
    tz: form.data.tz,
    venue: form.data.venue || null,
    country_code: form.data.country || null,
    city: form.data.city || null,
    organiser_name: form.data.organiser_name,
    price_note: form.data.price_note,
    registration_url: form.data.registration_url || null,
    listing_id: listing.id,
    image_media_id: z.uuid().safeParse(image).success ? image : null,
    description_html: html,
    editor_note: note || null,
    promoted_until: promoted,
  };

  let previous: (Row & { listing_slug: string | null }) | null = null;
  let savedId = id;
  if (id) {
    if (!z.uuid().safeParse(id).success) return { error: "That event was not found." };
    previous = await load(ctx, id);
    if (!previous) return { error: "That event was not found." };
    const { error } = await ctx.supabase.from("events").update(fields).eq("id", id);
    if (error) return { error: error.code === "23505" ? "Another event already uses that slug." : "The event could not be saved." };
  } else {
    const siteId = await getSiteId(ctx.supabase);
    if (!siteId) return { error: "The site is not available." };
    const { data: me } = await ctx.supabase.auth.getUser();
    const email = me.user?.email;
    if (!email) return { error: "Your account has no email address." };
    const { data, error } = await ctx.supabase
      .from("events")
      .insert({ ...fields, site_id: siteId, organiser_id: ctx.userId, contact_email: email.toLowerCase(), status: "draft" })
      .select("id")
      .single<{ id: string }>();
    if (error || !data) return { error: error?.code === "23505" ? "Another event already uses that slug." : "The event could not be created." };
    savedId = data.id;
  }

  const currentListing = await listingSlug(ctx, listing.id);
  refreshEvent(slug, currentListing);
  // The old address and the old listing's rail must drop the event too.
  if (previous && (previous.slug !== slug || previous.listing_slug !== currentListing)) {
    refreshEvent(previous.slug, previous.listing_slug);
  }
  redirect(`/admin/events/${savedId}?saved=1`);
}

const reviewSchema = z.object({
  id: z.uuid(),
  action: z.enum(["approve", "reject", "cancel", "unpublish"]),
  reason: z.string().trim().max(500),
});

export async function reviewEvent(formData: FormData) {
  const ctx = await getEditorContext();
  if (!ctx) redirect("/login?next=/admin/events");
  const parsed = reviewSchema.safeParse({
    id: formData.get("id") ?? "",
    action: formData.get("action") ?? "",
    reason: formData.get("reason") ?? "",
  });
  if (!parsed.success) redirect("/admin/events?error=invalid");
  const { id, action, reason } = parsed.data;
  const back = String(formData.get("back") ?? "") === "detail" ? `/admin/events/${id}` : "/admin/events";
  if (action === "reject" && !reason) redirect(`${back}?error=reason`);

  const row = await load(ctx, id);
  if (!row) redirect("/admin/events?error=not_found");

  const now = new Date().toISOString();
  const change =
    action === "approve"
      ? { status: "published", published_at: now, reviewed_by: ctx.userId, reject_reason: null }
      : action === "reject"
        ? { status: "rejected", reject_reason: reason, reviewed_by: ctx.userId }
        : action === "cancel"
          ? { status: "cancelled", reviewed_by: ctx.userId }
          : { status: "draft", reviewed_by: ctx.userId };
  if (action === "cancel" && row.status !== "published") redirect(`${back}?error=not_published`);

  const { error } = await ctx.supabase.from("events").update(change).eq("id", id);
  if (error) {
    console.error("event review failed", error.code);
    redirect(`${back}?error=save_failed`);
  }
  refreshEvent(row.slug, row.listing_slug);
  redirect(`${back}?saved=${action}`);
}
