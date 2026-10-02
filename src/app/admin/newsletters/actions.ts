"use server";

import { format } from "date-fns";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { callClaude, SHORT_TOKENS } from "@/lib/ai/claude";
import * as introPrompt from "@/lib/ai/prompts/newsletter-intro";
import { introSchema } from "@/lib/ai/schemas";
import { cleanLine } from "@/lib/ai/text";
import { type EditorContext, getEditorContext } from "@/lib/auth/editor";
import { mailConfig, NOT_CONFIGURED, sendIssueEmail } from "@/lib/newsletter/provider";
import { renderIssueMessage, sendIssue } from "@/lib/newsletter/send";
import { autoFillStories, liveStoriesById, MAX_STORIES, type StoryRow } from "@/lib/newsletter/stories";
import { UNSUBSCRIBE_PLACEHOLDER } from "@/lib/newsletter/urls";

const NOT_EDITOR = "Only editors can use the newsletter builder.";
const NOT_FOUND = "That issue could not be found.";
const NOT_LIVE = "Only live stories can go in an issue. A draft, scheduled-for-later or unpublished story was not added.";

export type Fail = { ok: false; error: string };

const oneLine = z.string().trim().refine((s) => !/[\r\n]/.test(s), "Use a single line.");
const issueInput = z.object({
  id: z.uuid(),
  subject: oneLine.pipe(z.string().min(1, "Add a subject.").max(150)),
  preheader: oneLine.pipe(z.string().max(150)),
  intro: z.string().trim().max(2000, "The intro is up to 2000 characters."),
  story_ids: z.array(z.uuid()).max(MAX_STORIES).refine((ids) => new Set(ids).size === ids.length, "A story is listed twice."),
});
export type IssueInput = z.input<typeof issueInput>;

type IssueRecord = {
  id: string;
  site_id: string;
  list_id: string;
  status: "draft" | "scheduled" | "sent";
  story_ids: string[];
  newsletter_lists: { name: string; slug: string } | null;
};

async function loadIssue(ctx: EditorContext, id: string): Promise<IssueRecord | null> {
  const { data } = await ctx.supabase
    .from("newsletter_issues")
    .select("id, site_id, list_id, status, story_ids, newsletter_lists(name, slug)")
    .eq("id", id)
    .maybeSingle();
  return (data as unknown as IssueRecord | null) ?? null;
}

// Validates the form state and checks every story is live right now.
async function checkedInput(
  ctx: EditorContext,
  raw: IssueInput,
): Promise<{ ok: true; input: z.output<typeof issueInput>; issue: IssueRecord; stories: StoryRow[] } | Fail> {
  const parsed = issueInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the issue and try again." };
  const issue = await loadIssue(ctx, parsed.data.id);
  if (!issue) return { ok: false, error: NOT_FOUND };
  if (issue.status === "sent") return { ok: false, error: "A sent issue can't be changed." };
  const stories = await liveStoriesById(ctx.supabase, parsed.data.story_ids);
  if (stories.length !== parsed.data.story_ids.length) return { ok: false, error: NOT_LIVE };
  return { ok: true, input: parsed.data, issue, stories };
}

// New issue for a list, pre-filled with that list's live stories (24 hours daily, 7 days weekly).
export async function createIssue(formData: FormData) {
  const ctx = await getEditorContext();
  if (!ctx) redirect("/login");

  const listId = z.uuid().safeParse(String(formData.get("list_id") ?? ""));
  if (!listId.success) redirect("/admin/newsletters?error=list");
  const { data: list } = await ctx.supabase
    .from("newsletter_lists")
    .select("id, site_id, slug, name")
    .eq("id", listId.data)
    .maybeSingle<{ id: string; site_id: string; slug: string; name: string }>();
  if (!list) redirect("/admin/newsletters?error=list");

  const stories = await autoFillStories(ctx.supabase, list.slug);
  const { data, error } = await ctx.supabase
    .from("newsletter_issues")
    .insert({
      site_id: list.site_id,
      list_id: list.id,
      subject: `${list.name} — ${format(new Date(), "d MMM yyyy")}`,
      story_ids: stories.map((s) => s.id),
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) redirect("/admin/newsletters?error=create");
  redirect(`/admin/newsletters/${data.id}`);
}

export async function saveIssue(raw: IssueInput): Promise<{ ok: true } | Fail> {
  const ctx = await getEditorContext();
  if (!ctx) return { ok: false, error: NOT_EDITOR };
  const checked = await checkedInput(ctx, raw);
  if (!checked.ok) return checked;

  const { error } = await ctx.supabase
    .from("newsletter_issues")
    .update({
      subject: checked.input.subject,
      preheader: checked.input.preheader || null,
      intro: checked.input.intro,
      story_ids: checked.input.story_ids,
    })
    .eq("id", checked.input.id);
  if (error) return { ok: false, error: "The issue could not be saved." };
  revalidatePath(`/admin/newsletters/${checked.input.id}`);
  return { ok: true };
}

// The live stories for this issue's list and window, without saving anything.
export async function autoFill(issueId: string): Promise<{ ok: true; ids: string[] } | Fail> {
  const ctx = await getEditorContext();
  if (!ctx) return { ok: false, error: NOT_EDITOR };
  const issue = await loadIssue(ctx, issueId);
  if (!issue) return { ok: false, error: NOT_FOUND };
  const stories = await autoFillStories(ctx.supabase, issue.newsletter_lists?.slug ?? "weekly");
  return { ok: true, ids: stories.map((s) => s.id) };
}

// The assistant drafts the intro; the editor can change every word. Not configured is reported
// here and the rest of the builder keeps working.
export async function draftIntro(raw: IssueInput): Promise<{ ok: true; intro: string } | Fail> {
  const ctx = await getEditorContext();
  if (!ctx) return { ok: false, error: NOT_EDITOR };
  const checked = await checkedInput(ctx, raw);
  if (!checked.ok) return checked;
  if (checked.stories.length === 0) return { ok: false, error: "Add at least one story first." };

  const result = await callClaude({
    instructions: introPrompt.PROMPT,
    article: checked.stories
      .map((s, i) => `${i + 1}. Title: ${cleanLine(s.title)}\n   Dek: ${cleanLine(s.dek)}`)
      .join("\n"),
    schema: introSchema,
    maxTokens: SHORT_TOKENS,
  });
  if (!result.ok) return result;
  return { ok: true, intro: result.data.intro };
}

async function message(ctx: EditorContext, raw: IssueInput) {
  const checked = await checkedInput(ctx, raw);
  if (!checked.ok) return checked;
  const rendered = await renderIssueMessage({
    listName: checked.issue.newsletter_lists?.name ?? "Newsletter",
    preheader: checked.input.preheader,
    intro: checked.input.intro,
    stories: checked.stories,
  });
  if ("error" in rendered) return { ok: false, error: rendered.error } as Fail;
  return { ok: true as const, checked, rendered };
}

// HTML for the sandboxed preview iframe. The unsubscribe link points nowhere.
export async function previewIssue(raw: IssueInput): Promise<{ ok: true; html: string } | Fail> {
  const ctx = await getEditorContext();
  if (!ctx) return { ok: false, error: NOT_EDITOR };
  const built = await message(ctx, raw);
  if (!built.ok) return built;
  return { ok: true, html: built.rendered.html.split(UNSUBSCRIBE_PLACEHOLDER).join("#") };
}

// One address, subject prefixed [Test]. No delivery row, no status change.
export async function sendTest(raw: IssueInput, to: string): Promise<{ ok: true } | Fail> {
  const ctx = await getEditorContext();
  if (!ctx) return { ok: false, error: NOT_EDITOR };
  const address = z.email().safeParse(to.trim());
  if (!address.success) return { ok: false, error: "Enter a valid test address." };
  const cfg = mailConfig();
  if (!cfg) return { ok: false, error: NOT_CONFIGURED };
  const built = await message(ctx, raw);
  if (!built.ok) return built;

  const link = `${cfg.siteUrl.replace(/\/+$/, "")}/newsletter/unsubscribe`;
  const outcome = await sendIssueEmail({
    to: address.data,
    subject: `[Test] ${built.checked.input.subject}`,
    html: built.rendered.html.split(UNSUBSCRIBE_PLACEHOLDER).join(link),
    text: built.rendered.text.split(UNSUBSCRIBE_PLACEHOLDER).join(link),
    unsubscribeUrl: link,
  });
  return outcome.ok ? { ok: true } : { ok: false, error: outcome.error };
}

// Sends the saved issue now to the active subscribers of its list.
export async function sendNow(issueId: string): Promise<{ ok: true; sent: number; skipped: number; failed: number } | Fail> {
  const ctx = await getEditorContext();
  if (!ctx) return { ok: false, error: NOT_EDITOR };
  const id = z.uuid().safeParse(issueId);
  if (!id.success) return { ok: false, error: NOT_FOUND };
  const report = await sendIssue(ctx.supabase, id.data);
  revalidatePath(`/admin/newsletters/${id.data}`);
  revalidatePath("/admin/newsletters");
  return report;
}

export async function scheduleIssue(issueId: string, scheduledFor: string): Promise<{ ok: true } | Fail> {
  const ctx = await getEditorContext();
  if (!ctx) return { ok: false, error: NOT_EDITOR };
  const id = z.uuid().safeParse(issueId);
  const when = z.iso.datetime({ offset: true }).safeParse(scheduledFor);
  if (!id.success) return { ok: false, error: NOT_FOUND };
  if (!when.success || new Date(when.data).getTime() <= Date.now()) return { ok: false, error: "Pick a time in the future." };
  const issue = await loadIssue(ctx, id.data);
  if (!issue) return { ok: false, error: NOT_FOUND };
  if (issue.status === "sent") return { ok: false, error: "A sent issue can't be scheduled." };

  // The cron retries every due issue. One with no live stories never sends and blocks the queue.
  const storyIds = issue.story_ids ?? [];
  const stories = await liveStoriesById(ctx.supabase, storyIds);
  if (stories.length === 0) return { ok: false, error: "Add at least one live story before scheduling." };
  if (stories.length !== storyIds.length) return { ok: false, error: NOT_LIVE };

  // A sent issue is invisible to the update policy, and that update reports no error.
  // Require a row back so a lost race is not announced as scheduled.
  const { data: updated, error } = await ctx.supabase
    .from("newsletter_issues")
    .update({ status: "scheduled", scheduled_for: when.data })
    .eq("id", id.data)
    .in("status", ["draft", "scheduled"])
    .select("id");
  if (error || !updated?.length) return { ok: false, error: "The issue could not be scheduled." };
  revalidatePath(`/admin/newsletters/${id.data}`);
  revalidatePath("/admin/newsletters");
  return { ok: true };
}

export async function unscheduleIssue(issueId: string): Promise<{ ok: true } | Fail> {
  const ctx = await getEditorContext();
  if (!ctx) return { ok: false, error: NOT_EDITOR };
  const id = z.uuid().safeParse(issueId);
  if (!id.success) return { ok: false, error: NOT_FOUND };
  const { error } = await ctx.supabase
    .from("newsletter_issues")
    .update({ status: "draft", scheduled_for: null })
    .eq("id", id.data)
    .eq("status", "scheduled");
  if (error) return { ok: false, error: "The issue could not be unscheduled." };
  revalidatePath(`/admin/newsletters/${id.data}`);
  revalidatePath("/admin/newsletters");
  return { ok: true };
}
