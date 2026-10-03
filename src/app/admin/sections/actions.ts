"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { isSectionIcon } from "@/components/public/section-icon";
import { getEditorContext } from "@/lib/auth/editor";
import { BRAND_HEX } from "@/lib/design/brand";
import { isHexColor, sectionColorProblem } from "@/lib/design/contrast";
import { createTaxonomy, renameTaxonomy } from "@/lib/taxonomy";

export async function create(formData: FormData) {
  await createTaxonomy("sections", formData);
}

export async function rename(formData: FormData) {
  await renameTaxonomy("sections", formData);
}

const back = (query: Record<string, string>): never => redirect(`/admin/sections?${new URLSearchParams(query).toString()}`);

// A section's colour and icon. Editors and admins only (checked here, and again by RLS on the update).
// The colour must be a plain #rrggbb that stays readable on the page, because it is used both as text
// and as a band behind light text. "Use default" clears both, and the site falls back to its tokens.
export async function updateStyle(formData: FormData) {
  const ctx = await getEditorContext();
  if (!ctx) redirect("/login");

  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) back({ error: "invalid_color" });

  let patch: { color: string | null; icon: string | null };
  if (formData.get("reset") === "1") {
    patch = { color: null, icon: null };
  } else {
    const color = String(formData.get("color") ?? "").trim();
    const icon = String(formData.get("icon") ?? "").trim();
    if (!isHexColor(color) || (icon !== "" && !isSectionIcon(icon))) back({ error: "invalid_color" });
    if (sectionColorProblem(color, BRAND_HEX.paper)) back({ error: "color_contrast" });
    patch = { color: color.toUpperCase(), icon: icon || null };
  }

  const { data, error } = await ctx.supabase.from("sections").update(patch).eq("id", id.data!).select("id");
  if (error || !data?.length) back({ error: "save_failed" });
  // Section colours appear in the header, footer, cards and bands on every public page.
  revalidatePath("/", "layout");
  back({ saved: "style" });
}
