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
  // Each slot posts its label and, for an existing option, its id. Options are matched by id, never by
  // position, so a vote always stays with the text it was cast for.
  const labelsIn = formData.getAll("option").map((value) => String(value).trim().replace(/[<>]/g, ""));
  const idsIn = formData.getAll("option_id").map((value) => String(value));
  const slots = labelsIn.slice(0, 6).map((label, index) => ({ label, id: z.uuid().safeParse(idsIn[index]).success ? idsIn[index] : null }));
  const kept = slots.filter((slot) => slot.label);
  if (kept.length < 2) return { error: "A poll needs at least two options." };
  if (kept.some((slot) => slot.label.length > 120)) return { error: "Keep each option under 120 characters." };
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

  // Check everything before writing anything: removed options must have no votes. A new poll has none.
  const { data: existing } = parsed.data.id
    ? await ctx.supabase.from("poll_options").select("id, sort").eq("poll_id", parsed.data.id).returns<{ id: string; sort: number }[]>()
    : { data: [] as { id: string; sort: number }[] };
  const current = new Map((existing ?? []).map((row) => [row.id, row.sort]));
  const keptIds = new Set(kept.flatMap((slot) => (slot.id && current.has(slot.id) ? [slot.id] : [])));
  const removed = [...current.keys()].filter((optionId) => !keptIds.has(optionId));
  for (const optionId of removed) {
    const { count } = await ctx.supabase.from("poll_votes").select("id", { count: "exact", head: true }).eq("option_id", optionId);
    if ((count ?? 0) > 0) return { error: "An option with votes can't be removed or emptied. Close the poll and create a new one instead." };
  }

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

  for (const optionId of removed) {
    const { error } = await ctx.supabase.from("poll_options").delete().eq("id", optionId);
    if (error) return { error: "The options could not be saved." };
  }
  const used = new Set([...keptIds].map((optionId) => current.get(optionId)!));
  const free = [0, 1, 2, 3, 4, 5].filter((sort) => !used.has(sort));
  for (const slot of kept) {
    const { error } =
      slot.id && current.has(slot.id)
        ? await ctx.supabase.from("poll_options").update({ label: slot.label }).eq("id", slot.id)
        : await ctx.supabase.from("poll_options").insert({ site_id: siteId, poll_id: pollId, label: slot.label, sort: free.shift()! });
    if (error) return { error: "The options could not be saved." };
  }
  redirect(`/admin/polls/${pollId}?saved=1`);
}
