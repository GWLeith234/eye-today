"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { getEditorContext } from "@/lib/auth/editor";
import { getSiteId } from "@/lib/site";

export type SaveState = { error: string | null };

const schema = z.object({
  id: z.uuid().or(z.literal("")),
  question: z.string().trim().min(1).max(200),
  status: z.enum(["draft", "open", "closed"]),
  results: z.enum(["after_vote", "after_close", "always"]),
  opens_at: z.string().trim(),
  closes_at: z.string().trim(),
});

// datetime-local values are read as UTC so editors see the same time the poll uses.
function instant(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function savePoll(_state: SaveState, formData: FormData): Promise<SaveState> {
  const ctx = await getEditorContext();
  if (!ctx) return { error: "Your session has expired. Sign in again." };
  const parsed = schema.safeParse({
    id: formData.get("id") ?? "",
    question: formData.get("question") ?? "",
    status: formData.get("status") ?? "",
    results: formData.get("results") ?? "",
    opens_at: formData.get("opens_at") ?? "",
    closes_at: formData.get("closes_at") ?? "",
  });
  if (!parsed.success) return { error: "Check the question (up to 200 characters), status and results setting." };
  const labels = formData
    .getAll("option")
    .map((value) => String(value).trim().replace(/[<>]/g, ""))
    .filter(Boolean)
    .slice(0, 6);
  if (labels.length < 2) return { error: "A poll needs at least two options." };
  if (labels.some((label) => label.length > 120)) return { error: "Keep each option under 120 characters." };
  const opens = instant(parsed.data.opens_at);
  const closes = instant(parsed.data.closes_at);
  if (opens && closes && closes <= opens) return { error: "The poll must close after it opens." };

  const fields = {
    question: parsed.data.question.replace(/[<>]/g, ""),
    status: parsed.data.status,
    results: parsed.data.results,
    opens_at: opens,
    closes_at: closes,
  };

  let pollId = parsed.data.id;
  let siteId: string | null = null;
  if (pollId) {
    const { data, error } = await ctx.supabase.from("polls").update(fields).eq("id", pollId).select("site_id").maybeSingle<{ site_id: string }>();
    if (error || !data) return { error: "The poll could not be saved." };
    siteId = data.site_id;
  } else {
    siteId = await getSiteId(ctx.supabase);
    if (!siteId) return { error: "The site is not available." };
    const { data, error } = await ctx.supabase.from("polls").insert({ ...fields, site_id: siteId, created_by: ctx.userId }).select("id").single<{ id: string }>();
    if (error || !data) return { error: "The poll could not be created." };
    pollId = data.id;
  }

  // Options keep their position. An option that already has votes cannot be removed, so counts stay honest.
  const { data: existing } = await ctx.supabase.from("poll_options").select("id, sort").eq("poll_id", pollId).returns<{ id: string; sort: number }[]>();
  const bySort = new Map((existing ?? []).map((row) => [row.sort, row.id]));
  for (const [sort, label] of labels.entries()) {
    const current = bySort.get(sort);
    const { error } = current
      ? await ctx.supabase.from("poll_options").update({ label }).eq("id", current)
      : await ctx.supabase.from("poll_options").insert({ site_id: siteId, poll_id: pollId, label, sort });
    if (error) return { error: "The options could not be saved." };
  }
  for (const [sort, optionId] of bySort) {
    if (sort < labels.length) continue;
    const { count } = await ctx.supabase.from("poll_votes").select("id", { count: "exact", head: true }).eq("option_id", optionId);
    if ((count ?? 0) > 0) return { error: "An option with votes can't be removed. Close the poll and create a new one instead." };
    await ctx.supabase.from("poll_options").delete().eq("id", optionId);
  }
  redirect(`/admin/polls/${pollId}?saved=1`);
}
