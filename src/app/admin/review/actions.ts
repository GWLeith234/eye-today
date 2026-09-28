"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { type EditorContext, getEditorContext } from "@/lib/auth/editor";
import { sendMail } from "@/lib/email/resend";

const REVIEWABLE = ["submitted", "in_review"];

function back(id: string, query: Record<string, string>): never {
  redirect(`/admin/review/${id}?${new URLSearchParams(query).toString()}`);
}

async function requireEditor() {
  // getUser() + editor/admin role, both on the user-scoped client.
  const ctx = await getEditorContext();
  if (!ctx) redirect("/admin");
  return ctx;
}

// Moves the story only if it is still in one of `from`; returns its title, or null.
async function transition(ctx: EditorContext, id: string, from: string[], patch: Record<string, unknown>) {
  const { data, error } = await ctx.supabase.from("articles").update(patch).eq("id", id).in("status", from).select("title, slug");
  if (error || !data?.length) return null;
  return data[0] as { title: string; slug: string };
}

// Author emails the editor can read on profiles.
async function authorEmails(ctx: EditorContext, id: string) {
  const { data } = await ctx.supabase.from("article_authors").select("profiles(email)").eq("article_id", id);
  type Embedded = { email: string | null } | { email: string | null }[] | null;
  return ((data ?? []) as unknown as { profiles: Embedded }[])
    .flatMap((row) => (Array.isArray(row.profiles) ? row.profiles : [row.profiles]))
    .map((profile) => profile?.email ?? "")
    .filter(Boolean);
}

const idSchema = z.uuid();

export async function startReview(formData: FormData) {
  const ctx = await requireEditor();
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) redirect("/admin/review");
  const moved = await transition(ctx, id.data, ["submitted"], { status: "in_review" });
  if (!moved) back(id.data, { error: "moved" });
  back(id.data, { done: "in_review" });
}

const changesSchema = z.object({ id: z.uuid(), note: z.string().trim().min(1).max(4000) });

export async function requestChanges(formData: FormData) {
  const ctx = await requireEditor();
  const parsed = changesSchema.safeParse({ id: formData.get("id"), note: formData.get("note") ?? "" });
  if (!parsed.success) {
    const id = idSchema.safeParse(formData.get("id"));
    if (!id.success) redirect("/admin/review");
    back(id.data, { error: "note_required" });
  }
  const { id, note } = parsed.data;

  const { data: article } = await ctx.supabase
    .from("articles")
    .select("site_id, status")
    .eq("id", id)
    .maybeSingle<{ site_id: string; status: string }>();
  if (!article) redirect("/admin/review");
  if (!REVIEWABLE.includes(article.status)) back(id, { error: "moved" });

  // Note first: if it fails the story stays in review and the editor can retry.
  // Unlocking first would hand the story back with no explanation.
  const { error: noteError } = await ctx.supabase
    .from("editorial_notes")
    .insert({ site_id: article.site_id, article_id: id, author_id: ctx.userId, body: note, resolved: false });
  if (noteError) back(id, { error: "note_failed" });

  const moved = await transition(ctx, id, REVIEWABLE, { status: "draft" });
  if (!moved) back(id, { error: "moved" });

  const mail = await sendMail({
    to: await authorEmails(ctx, id),
    subject: `Changes requested: ${moved.title}`,
    text: `An editor asked for changes to "${moved.title}".\n\nTheir note:\n\n${note}\n\nOpen your contributor desk to update the story and resubmit.`,
  });
  back(id, mail.ok ? { done: "changes" } : { done: "changes", warning: "mail" });
}

const scheduleSchema = z.object({ id: z.uuid(), scheduled_for: z.iso.datetime({ offset: true }) });

export async function approveAndSchedule(formData: FormData) {
  const ctx = await requireEditor();
  const parsed = scheduleSchema.safeParse({ id: formData.get("id"), scheduled_for: formData.get("scheduled_for") });
  if (!parsed.success) {
    const id = idSchema.safeParse(formData.get("id"));
    if (!id.success) redirect("/admin/review");
    back(id.data, { error: "schedule_invalid" });
  }
  const { id, scheduled_for } = parsed.data;
  if (new Date(scheduled_for).getTime() <= Date.now()) back(id, { error: "schedule_past" });

  const moved = await transition(ctx, id, REVIEWABLE, { status: "scheduled", scheduled_for });
  if (!moved) back(id, { error: "moved" });
  back(id, { done: "scheduled" });
}

export async function publishNow(formData: FormData) {
  const ctx = await requireEditor();
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) redirect("/admin/review");

  const moved = await transition(ctx, id.data, REVIEWABLE, { status: "published", published_at: new Date().toISOString() });
  if (!moved) back(id.data, { error: "moved" });
  revalidatePath("/articles", "layout");

  const mail = await sendMail({
    to: await authorEmails(ctx, id.data),
    subject: `Published: ${moved.title}`,
    text: `Your story "${moved.title}" is now live on Eye Today at /articles/${moved.slug}.`,
  });
  back(id.data, mail.ok ? { done: "published" } : { done: "published", warning: "mail" });
}

export async function resolveNote(formData: FormData) {
  const ctx = await requireEditor();
  const parsed = z.object({ id: z.uuid(), note: z.uuid() }).safeParse({ id: formData.get("id"), note: formData.get("note") });
  if (!parsed.success) redirect("/admin/review");
  const { error } = await ctx.supabase.from("editorial_notes").update({ resolved: true }).eq("id", parsed.data.note).eq("article_id", parsed.data.id);
  back(parsed.data.id, error ? { error: "note_failed" } : { done: "resolved" });
}
