import type { SupabaseClient } from "@supabase/supabase-js";

// Live means what a reader can see today: published with published_at <= now, or scheduled
// with scheduled_for <= now. A draft is never live.
export type StoryRow = {
  id: string;
  title: string;
  dek: string | null;
  slug: string;
  is_sponsored: boolean;
  status: string;
  published_at: string | null;
  scheduled_for: string | null;
  sections: { slug: string } | null;
};

export const STORY_COLUMNS = "id, title, dek, slug, is_sponsored, status, published_at, scheduled_for, sections(slug)";

export const publicDate = (s: Pick<StoryRow, "published_at" | "scheduled_for">) => s.published_at ?? s.scheduled_for ?? "";

const liveFilter = (nowIso: string, sinceIso?: string) => {
  const since = (col: string) => (sinceIso ? `,${col}.gte.${sinceIso}` : "");
  return `and(status.eq.published,published_at.lte.${nowIso}${since("published_at")}),and(status.eq.scheduled,scheduled_for.lte.${nowIso}${since("scheduled_for")})`;
};

const byNewest = (a: StoryRow, b: StoryRow) => publicDate(b).localeCompare(publicDate(a));

// Newest live stories since `since`.
export async function recentLiveStories(supabase: SupabaseClient, since: Date, limit: number): Promise<StoryRow[]> {
  const { data } = await supabase
    .from("articles")
    .select(STORY_COLUMNS)
    .or(liveFilter(new Date().toISOString(), since.toISOString()))
    .limit(100);
  return ((data ?? []) as unknown as StoryRow[]).sort(byNewest).slice(0, limit);
}

// The subset of `ids` that is live right now, in the order given. Anything else (a draft,
// an unpublished story, an unknown id) is left out, so callers compare lengths to reject it.
export async function liveStoriesById(supabase: SupabaseClient, ids: string[]): Promise<StoryRow[]> {
  if (ids.length === 0) return [];
  const { data } = await supabase
    .from("articles")
    .select(STORY_COLUMNS)
    .in("id", ids)
    .or(liveFilter(new Date().toISOString()));
  const byId = new Map(((data ?? []) as unknown as StoryRow[]).map((s) => [s.id, s]));
  return ids.flatMap((id) => {
    const story = byId.get(id);
    return story ? [story] : [];
  });
}

export const AUTOFILL_WINDOW_HOURS: Record<string, number> = { daily: 24, weekly: 24 * 7 };
export const AUTOFILL_LIMIT = 10;
export const MAX_STORIES = 20;

export async function autoFillStories(supabase: SupabaseClient, listSlug: string): Promise<StoryRow[]> {
  const hours = AUTOFILL_WINDOW_HOURS[listSlug] ?? 24 * 7;
  return recentLiveStories(supabase, new Date(Date.now() - hours * 3_600_000), AUTOFILL_LIMIT);
}

export function isLiveNow(s: Pick<StoryRow, "status" | "published_at" | "scheduled_for">): boolean {
  const now = Date.now();
  if (s.status === "published") return s.published_at !== null && new Date(s.published_at).getTime() <= now;
  if (s.status === "scheduled") return s.scheduled_for !== null && new Date(s.scheduled_for).getTime() <= now;
  return false;
}

export const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);
