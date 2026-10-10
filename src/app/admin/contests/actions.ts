"use server";

import { randomBytes } from "node:crypto";

import { redirect } from "next/navigation";
import { z } from "zod";

import { getEditorContext } from "@/lib/auth/editor";
import { getSiteId } from "@/lib/site";
import { SLUG_RE } from "@/lib/slug";

export type SaveState = { error: string | null };

const plain = (max: number) => z.string().trim().max(max).transform((value) => value.replace(/[<>]/g, ""));

const schema = z.object({
  id: z.uuid().or(z.literal("")),
  slug: z.string().trim().toLowerCase().regex(SLUG_RE).max(120),
  title: plain(160).pipe(z.string().min(1)),
  description: plain(4000),
  prize: plain(300).pipe(z.string().min(1)),
  rules: plain(12000).pipe(z.string().min(20)),
  eligibility: plain(1000),
  question: plain(300),
  status: z.enum(["draft", "open", "closed"]),
  opens_at: z.string().trim(),
  closes_at: z.string().trim(),
});

function instant(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function saveContest(_state: SaveState, formData: FormData): Promise<SaveState> {
  const ctx = await getEditorContext();
  if (!ctx) return { error: "Your session has expired. Sign in again." };
  const parsed = schema.safeParse(Object.fromEntries(["id", "slug", "title", "description", "prize", "rules", "eligibility", "question", "status", "opens_at", "closes_at"].map((k) => [k, String(formData.get(k) ?? "")])));
  if (!parsed.success) return { error: "Check the title, a lowercase slug, the prize, and rules of at least 20 characters." };
  const closes = instant(parsed.data.closes_at);
  const opens = instant(parsed.data.opens_at);
  if (!closes) return { error: "A contest needs a closing date and time." };
  if (opens && closes <= opens) return { error: "The contest must close after it opens." };

  const { id, slug, title, description, prize, rules, eligibility, question, status } = parsed.data;
  const fields = { slug, title, description, prize, rules, eligibility, status, question: question || null, opens_at: opens, closes_at: closes };
  let contestId = id;
  if (id) {
    const { error } = await ctx.supabase.from("contests").update(fields).eq("id", id);
    if (error) return { error: error.code === "23505" ? "Another contest uses that slug." : "The contest could not be saved." };
  } else {
    const siteId = await getSiteId(ctx.supabase);
    if (!siteId) return { error: "The site is not available." };
    const { data, error } = await ctx.supabase.from("contests").insert({ ...fields, site_id: siteId, created_by: ctx.userId }).select("id").single<{ id: string }>();
    if (error || !data) return { error: error?.code === "23505" ? "Another contest uses that slug." : "The contest could not be created." };
    contestId = data.id;
  }
  redirect(`/admin/contests/${contestId}?saved=1`);
}

// Draws after the contest has closed: a crypto-random seed, entries ordered by id, winner = sha256(seed) mod n.
export async function drawWinner(formData: FormData) {
  const ctx = await getEditorContext();
  if (!ctx) redirect("/login?next=/admin/contests");
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) redirect("/admin/contests");
  const back = `/admin/contests/${id.data}`;

  // The database counts and orders every entry (no API row cap) and records the draw in one step,
  // using the same rule as src/lib/contests/draw.ts.
  const seed = randomBytes(32).toString("hex");
  const { error } = await ctx.supabase.rpc("draw_contest", { p_contest: id.data, p_seed: seed });
  if (error) {
    if (error.message === "not closed") redirect(`${back}?error=not_closed`);
    if (error.message === "no entries") redirect(`${back}?error=no_entries`);
    console.error("contest draw failed", error.code);
    redirect(`${back}?error=draw_failed`);
  }
  redirect(`${back}?saved=drawn`);
}
