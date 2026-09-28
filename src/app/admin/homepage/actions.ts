"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getEditorContext } from "@/lib/auth/editor";
import { getSiteId } from "@/lib/site";

import { SLOTS } from "./slots";

const choice = z.union([z.literal(""), z.uuid()]);
const formSchema = z.object(Object.fromEntries(SLOTS.map((s) => [s.field, choice])) as Record<string, typeof choice>);

function back(query: Record<string, string>): never {
  redirect(`/admin/homepage?${new URLSearchParams(query).toString()}`);
}

// Empty choices clear the slot; the public homepage then fills it with the newest live story.
export async function saveHomepage(formData: FormData) {
  const ctx = await getEditorContext();
  if (!ctx) redirect("/login");

  const parsed = formSchema.safeParse(Object.fromEntries(SLOTS.map((s) => [s.field, String(formData.get(s.field) ?? "")])));
  if (!parsed.success) back({ error: "invalid" });
  const picks = SLOTS.map((s) => ({ ...s, article_id: parsed.data[s.field] || null }));

  const chosen = picks.flatMap((p) => (p.article_id ? [p.article_id] : []));
  if (new Set(chosen).size !== chosen.length) back({ error: "duplicate" });

  if (chosen.length) {
    const { data } = await ctx.supabase.from("articles").select("id, status").in("id", chosen);
    const rows = (data ?? []) as { id: string; status: string }[];
    const ok = new Set(rows.filter((r) => r.status === "published" || r.status === "scheduled").map((r) => r.id));
    if (chosen.some((id) => !ok.has(id))) back({ error: "not_live" });
  }

  const siteId = await getSiteId(ctx.supabase);
  if (!siteId) back({ error: "no_site" });

  for (const pick of picks) {
    const { error } = pick.article_id
      ? await ctx.supabase
          .from("homepage_slots")
          .upsert(
            { site_id: siteId, slot: pick.slot, position: pick.position, article_id: pick.article_id },
            { onConflict: "site_id,slot,position" },
          )
      : await ctx.supabase
          .from("homepage_slots")
          .delete()
          .eq("site_id", siteId)
          .eq("slot", pick.slot)
          .eq("position", pick.position);
    if (error) back({ error: "save_failed" });
  }

  revalidatePath("/");
  back({ saved: "1" });
}
