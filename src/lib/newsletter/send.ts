import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { mailConfig, NOT_CONFIGURED, sendIssueEmail } from "./provider";
import { type Rendered, renderIssue } from "./render";
import { liveStoriesById, type StoryRow } from "./stories";
import { unsubscribeToken } from "./tokens";
import { storyUrl, UNSUBSCRIBE_PLACEHOLDER, unsubscribeUrl } from "./urls";

export type IssueRow = {
  id: string;
  site_id: string;
  list_id: string;
  subject: string;
  preheader: string | null;
  intro: string;
  story_ids: string[];
  status: "draft" | "scheduled" | "sent";
};

export type IssueContent = { listName: string; preheader: string; intro: string; stories: StoryRow[] };

// The message with a placeholder where each recipient's unsubscribe link goes.
export async function renderIssueMessage(content: IssueContent): Promise<Rendered | { error: string }> {
  const cfg = mailConfig();
  if (!cfg) return { error: NOT_CONFIGURED };
  return renderIssue({
    listName: content.listName,
    preheader: content.preheader,
    intro: content.intro,
    stories: content.stories.map((s) => ({
      title: s.title,
      dek: s.dek,
      url: storyUrl(cfg.siteUrl, s.sections?.slug ?? "", s.slug),
      sponsored: s.is_sponsored,
    })),
    postalAddress: cfg.postalAddress,
    siteUrl: cfg.siteUrl,
    unsubscribeUrl: UNSUBSCRIBE_PLACEHOLDER,
  });
}

const withLink = (message: string, url: string) => message.split(UNSUBSCRIBE_PLACEHOLDER).join(url);

export type SendReport = { ok: true; sent: number; skipped: number; failed: number } | { ok: false; error: string };

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Sends one issue to the active subscribers of its list. Runs with whichever client the caller
// holds: the editor's for "Send now", the service role for the cron. Bounced, pending and
// unsubscribed rows are never selected. A delivery row is inserted before each provider call;
// a conflict means that recipient was already attempted and is skipped.
export async function sendIssue(supabase: SupabaseClient, issueId: string): Promise<SendReport> {
  const cfg = mailConfig();
  if (!cfg) return { ok: false, error: NOT_CONFIGURED };

  const { data: issue } = await supabase
    .from("newsletter_issues")
    .select("id, site_id, list_id, subject, preheader, intro, story_ids, status")
    .eq("id", issueId)
    .maybeSingle<IssueRow>();
  if (!issue) return { ok: false, error: "That issue could not be found." };
  if (issue.status === "sent") return { ok: false, error: "That issue has already been sent." };

  const { data: list } = await supabase.from("newsletter_lists").select("name").eq("id", issue.list_id).maybeSingle<{ name: string }>();
  if (!list) return { ok: false, error: "That issue's list could not be found." };

  const stories = await liveStoriesById(supabase, issue.story_ids);
  if (stories.length === 0) return { ok: false, error: "Add at least one live story before sending." };

  const message = await renderIssueMessage({ listName: list.name, preheader: issue.preheader ?? "", intro: issue.intro, stories });
  if ("error" in message) return { ok: false, error: message.error };

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let after = "00000000-0000-0000-0000-000000000000";

  for (;;) {
    const { data: page, error } = await supabase
      .from("newsletter_subscribers")
      .select("id, email, confirm_token_hash")
      .eq("list_id", issue.list_id)
      .eq("status", "active")
      .gt("id", after)
      .order("id")
      .limit(200);
    if (error) return { ok: false, error: "Subscribers could not be loaded." };
    if (!page || page.length === 0) break;

    for (const sub of page as { id: string; email: string; confirm_token_hash: string | null }[]) {
      after = sub.id;
      if (!sub.confirm_token_hash) {
        failed++;
        continue;
      }

      const { data: delivery, error: insertError } = await supabase
        .from("newsletter_deliveries")
        .insert({ site_id: issue.site_id, issue_id: issue.id, subscriber_id: sub.id })
        .select("id")
        .single<{ id: string }>();
      if (insertError) {
        if (insertError.code === "23505") skipped++;
        else failed++;
        continue;
      }

      const link = unsubscribeUrl(cfg.siteUrl, unsubscribeToken(cfg.linkSecret, sub.confirm_token_hash).raw);
      const outcome = await sendIssueEmail({
        to: sub.email,
        subject: issue.subject,
        html: withLink(message.html, link),
        text: withLink(message.text, link),
        unsubscribeUrl: link,
        issueId: issue.id,
        subscriberId: sub.id,
      });
      if (!outcome.ok) {
        failed++;
        continue;
      }
      sent++;
      if (outcome.providerId) {
        await supabase.from("newsletter_deliveries").update({ provider_id: outcome.providerId }).eq("id", delivery.id);
      }
      await pause(250);
    }
    if (page.length < 200) break;
  }

  // What went out, with the placeholder still in place of any one reader's link.
  const { error: doneError } = await supabase
    .from("newsletter_issues")
    .update({ status: "sent", sent_at: new Date().toISOString(), body_html: message.html })
    .eq("id", issue.id);
  if (doneError) return { ok: false, error: "The issue was sent, but it could not be marked as sent." };

  return { ok: true, sent, skipped, failed };
}

