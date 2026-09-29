import "server-only";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getEditorContext } from "@/lib/auth/editor";
import { isReservedSectionSlug } from "@/lib/public/reserved";
import { getSiteId } from "@/lib/site";
import { SLUG_RE, slugify } from "@/lib/slug";

// Shared create/rename for sections and tags. Editors and admins only; the
// writes go through the caller's session and RLS checks the role again.

type Table = "sections" | "tags";

const nameSchema = z.string().trim().min(1).max(80);

function back(table: Table, query: Record<string, string>): never {
  redirect(`/admin/${table}?${new URLSearchParams(query).toString()}`);
}

export async function createTaxonomy(table: Table, formData: FormData) {
  const ctx = await getEditorContext();
  if (!ctx) redirect("/login");

  const name = nameSchema.safeParse(formData.get("name"));
  if (!name.success) back(table, { error: "invalid_name" });
  const slug = slugify(String(formData.get("slug") || name.data));
  if (!SLUG_RE.test(slug)) back(table, { error: "invalid_slug" });
  // Sections live at /<slug>, so they cannot take a path the app already uses.
  if (table === "sections" && isReservedSectionSlug(slug)) back(table, { error: "reserved_slug" });

  const siteId = await getSiteId(ctx.supabase);
  if (!siteId) back(table, { error: "no_site" });

  const row: Record<string, unknown> = { site_id: siteId, slug, name: name.data };
  if (table === "sections") {
    const sort = Number(formData.get("sort") ?? 0);
    row.sort = Number.isFinite(sort) ? Math.trunc(sort) : 0;
  }

  const { error } = await ctx.supabase.from(table).insert(row);
  if (error) back(table, { error: error.code === "23505" ? "duplicate_slug" : "save_failed" });
  // Section names appear in the public header on every page.
  revalidatePath("/", "layout");
  back(table, { saved: "created" });
}

export async function renameTaxonomy(table: Table, formData: FormData) {
  const ctx = await getEditorContext();
  if (!ctx) redirect("/login");

  const id = z.uuid().safeParse(formData.get("id"));
  const name = nameSchema.safeParse(formData.get("name"));
  if (!id.success || !name.success) back(table, { error: "invalid_name" });

  const { data, error } = await ctx.supabase.from(table).update({ name: name.data }).eq("id", id.data).select("id");
  if (error || !data?.length) back(table, { error: "save_failed" });
  revalidatePath("/", "layout");
  back(table, { saved: "renamed" });
}

export const TAXONOMY_ERRORS: Record<string, string> = {
  invalid_name: "Names are required and up to 80 characters.",
  invalid_slug: "Slugs use lowercase letters, numbers and hyphens.",
  duplicate_slug: "That slug is already taken.",
  reserved_slug: "That slug is used by a site page. Choose another.",
  no_site: "No site is set up yet.",
  save_failed: "That change could not be saved.",
};
