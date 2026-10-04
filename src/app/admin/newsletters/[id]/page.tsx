import { notFound } from "next/navigation";

import { requireArea } from "@/lib/auth/session";
import { isMailConfigured } from "@/lib/newsletter/provider";
import { daysAgo, isLiveNow, recentLiveStories, STORY_COLUMNS, type StoryRow } from "@/lib/newsletter/stories";
import { isAssistantConfigured } from "@/lib/ai/claude";

import { IssueBuilder, type StoryOption } from "./issue-builder";

type IssueRow = {
  id: string;
  list_id: string;
  subject: string;
  preheader: string | null;
  intro: string;
  story_ids: string[];
  include_directory: boolean;
  status: "draft" | "scheduled" | "sent";
  scheduled_for: string | null;
  sent_at: string | null;
  newsletter_lists: { name: string; slug: string } | null;
};

const EVENT_TYPES = ["delivered", "opened", "clicked", "bounced"] as const;

export default async function IssuePage({ params }: PageProps<"/admin/newsletters/[id]">) {
  const { supabase } = await requireArea("admin");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const { data } = await supabase
    .from("newsletter_issues")
    .select("id, list_id, subject, preheader, intro, story_ids, include_directory, status, scheduled_for, sent_at, newsletter_lists(name, slug)")
    .eq("id", id)
    .maybeSingle();
  const issue = data as unknown as IssueRow | null;
  if (!issue) notFound();

  const [recent, selected, active, ...counts] = await Promise.all([
    recentLiveStories(supabase, daysAgo(30), 60),
    issue.story_ids.length
      ? supabase.from("articles").select(STORY_COLUMNS).in("id", issue.story_ids)
      : Promise.resolve({ data: [] as unknown[] }),
    supabase.from("newsletter_subscribers").select("id", { count: "exact", head: true }).eq("list_id", issue.list_id).eq("status", "active"),
    ...EVENT_TYPES.map((type) =>
      supabase.from("newsletter_events").select("id", { count: "exact", head: true }).eq("issue_id", issue.id).eq("event_type", type),
    ),
  ]);

  const selectedRows = (selected.data ?? []) as unknown as StoryRow[];
  const options = new Map<string, StoryOption>();
  for (const s of [...selectedRows, ...recent]) {
    options.set(s.id, { id: s.id, title: s.title, section: s.sections?.slug ?? "", live: isLiveNow(s), sponsored: s.is_sponsored });
  }

  const stats = Object.fromEntries(EVENT_TYPES.map((type, i) => [type, counts[i].count ?? 0]));

  return (
    <IssueBuilder
      issue={{
        id: issue.id,
        listName: issue.newsletter_lists?.name ?? "Newsletter",
        subject: issue.subject,
        preheader: issue.preheader ?? "",
        intro: issue.intro,
        storyIds: issue.story_ids,
        includeDirectory: issue.include_directory,
        status: issue.status,
        scheduledFor: issue.scheduled_for,
        sentAt: issue.sent_at,
      }}
      stories={[...options.values()]}
      activeSubscribers={active.count ?? 0}
      stats={stats as Record<(typeof EVENT_TYPES)[number], number>}
      mailConfigured={isMailConfigured()}
      assistantConfigured={isAssistantConfigured()}
    />
  );
}
