"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireArea } from "@/lib/auth/session";
import { getSiteId } from "@/lib/site";

// Every write goes through the signed-in editor's own session: RLS and column grants decide, not this file.

const REASON = z.string().trim().min(1).max(500);

function back(params: Record<string, string>): never {
  redirect(`/admin/comments?${new URLSearchParams(params).toString()}`);
}

async function refreshStory(supabase: Awaited<ReturnType<typeof requireArea>>["supabase"], commentId: string) {
  const { data: row } = await supabase
    .from("comments")
    .select("articles(slug, sections(slug))")
    .eq("id", commentId)
    .maybeSingle<{ articles: { slug: string; sections: { slug: string } | null } | null }>();
  const article = row?.articles;
  if (article?.sections) revalidatePath(`/${article.sections.slug}/${article.slug}`);
}

// Only a comment still waiting can be approved or rejected here, so two editors never undo each other.
async function moderate(commentId: string, status: "published" | "rejected", reason: string | null): Promise<boolean> {
  const { supabase } = await requireArea("admin");
  const { data, error } = await supabase
    .from("comments")
    .update({ status, reject_reason: status === "rejected" ? reason : null })
    .eq("id", commentId)
    .eq("status", "pending")
    .select("id");
  if (error || !data?.length) return false;
  if (status === "published") await refreshStory(supabase, commentId);
  return true;
}

export async function approveComment(formData: FormData) {
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) back({ error: "invalid" });
  back((await moderate(id.data, "published", null)) ? { done: "approved" } : { error: "not_pending" });
}

export async function rejectComment(formData: FormData) {
  const id = z.uuid().safeParse(formData.get("id"));
  const reason = REASON.safeParse(formData.get("reason"));
  if (!id.success || !reason.success) back({ error: "reason" });
  back((await moderate(id.data, "rejected", reason.data)) ? { done: "rejected" } : { error: "not_pending" });
}

export async function bulkModerate(formData: FormData) {
  const ids = formData.getAll("ids").map((v) => z.uuid().safeParse(v)).flatMap((r) => (r.success ? [r.data] : []));
  const intent = formData.get("intent");
  if (!ids.length) back({ error: "none" });
  let reason: string | null = null;
  if (intent === "reject") {
    const parsed = REASON.safeParse(formData.get("reason"));
    if (!parsed.success) back({ error: "reason" });
    reason = parsed.data;
  } else if (intent !== "approve") {
    back({ error: "invalid" });
  }
  // One id at a time, so the pending check applies to each row and finished rows are skipped.
  let changed = 0;
  for (const id of ids) {
    if (await moderate(id, intent === "approve" ? "published" : "rejected", reason)) changed += 1;
  }
  back({ done: "bulk", count: String(changed), skipped: String(ids.length - changed) });
}

export async function removeComment(formData: FormData) {
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) back({ error: "invalid" });
  const { supabase } = await requireArea("admin");
  const { data, error } = await supabase.from("comments").update({ status: "removed" }).eq("id", id.data).eq("status", "published").select("id");
  if (error || !data?.length) back({ error: "not_published" });
  await refreshStory(supabase, id.data);
  back({ done: "removed" });
}

async function setUserStatus(profileId: string, patch: { shadow_banned?: boolean; banned_until?: string | null }) {
  const { supabase } = await requireArea("admin");
  const siteId = await getSiteId(supabase);
  if (!siteId) return false;
  const { error } = await supabase.from("comment_user_status").upsert({ profile_id: profileId, site_id: siteId, ...patch }, { onConflict: "profile_id" });
  return !error;
}

export async function userAction(formData: FormData) {
  const id = z.uuid().safeParse(formData.get("profile_id"));
  if (!id.success) back({ error: "invalid" });
  const intent = formData.get("intent");
  let ok = false;
  switch (intent) {
    case "shadow":
      ok = await setUserStatus(id.data, { shadow_banned: true });
      break;
    case "unshadow":
      ok = await setUserStatus(id.data, { shadow_banned: false });
      break;
    case "ban_until": {
      const until = z.iso.date().safeParse(formData.get("until"));
      if (!until.success || new Date(`${until.data}T23:59:59Z`).getTime() <= Date.now()) back({ error: "date" });
      ok = await setUserStatus(id.data, { banned_until: `${until.data}T23:59:59Z` });
      break;
    }
    case "ban_forever":
      ok = await setUserStatus(id.data, { banned_until: "infinity" });
      break;
    case "unban":
      ok = await setUserStatus(id.data, { banned_until: null });
      break;
    default:
      back({ error: "invalid" });
  }
  back(ok ? { done: "user" } : { error: "save_failed" });
}

export async function setSiteComments(formData: FormData) {
  const { supabase } = await requireArea("admin");
  const { error } = await supabase.rpc("set_site_comments", { p_enabled: formData.get("enabled") === "on" });
  if (error) back({ error: "save_failed" });
  revalidatePath("/", "layout");
  back({ done: "site" });
}
