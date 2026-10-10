import { NextResponse } from "next/server";
import { z } from "zod";

import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type Published = {
  id: string;
  parent_id: string | null;
  body: string;
  created_at: string;
  display_name: string;
  is_supporter: boolean;
  own?: boolean;
};
type Mine = { id: string; parent_id: string | null; body: string; created_at: string; status: string; reject_reason: string | null };

const NO_STORE = { "Cache-Control": "no-store" };

const byTime = (a: { created_at: string; id: string }, b: { created_at: string; id: string }) =>
  a.created_at === b.created_at ? a.id.localeCompare(b.id) : a.created_at.localeCompare(b.created_at);

// Read with the visitor's own session. Held and rejected comments are theirs alone, so this is never cached.
export async function GET(request: Request) {
  const article = z.uuid().safeParse(new URL(request.url).searchParams.get("article"));
  if (!article.success) return NextResponse.json({ error: "invalid" }, { status: 400, headers: NO_STORE });

  const { supabase, user } = await getSession();
  const [open, published, mine, ownPublished, profile] = await Promise.all([
    supabase.rpc("comments_open", { p_article_id: article.data }),
    supabase.rpc("comments_for_article", { p_article_id: article.data }),
    user ? supabase.rpc("comments_for_author", { p_article_id: article.data }) : Promise.resolve({ data: [] }),
    // The policy hides shadow rows from their author, so this is only the truly published ones.
    user
      ? supabase.from("comments").select("id").eq("article_id", article.data).eq("profile_id", user.id).eq("status", "published")
      : Promise.resolve({ data: [] }),
    user
      ? supabase.from("profiles").select("display_name, role").eq("id", user.id).maybeSingle<{ display_name: string | null; role: string }>()
      : Promise.resolve({ data: null }),
  ]);

  const comments = (published.data ?? []) as Published[];
  const ownIds = new Set(((ownPublished.data ?? []) as { id: string }[]).map((row) => row.id));
  const held: Mine[] = [];

  // comments_for_author returns a shadow comment as "published". Show it to its author exactly as the
  // public list would show their real comments: in the thread, with their name and time, so nothing
  // tells them it never joined the public list.
  const name = profile.data?.display_name?.trim() || "Reader";
  const supporter = profile.data?.role === "supporter";
  const shadow: Published[] = [];
  for (const row of (mine.data ?? []) as Mine[]) {
    if (row.status !== "published") {
      held.push(row);
      continue;
    }
    ownIds.add(row.id);
    shadow.push({ id: row.id, parent_id: row.parent_id, body: row.body, created_at: row.created_at, display_name: name, is_supporter: supporter });
  }
  // Same thread rule as comments_for_article: a reply shows only under a parent that is showing.
  const showing = new Set([...comments.map((c) => c.id), ...shadow.filter((c) => c.parent_id === null).map((c) => c.id)]);
  const merged = [...comments, ...shadow.filter((c) => c.parent_id === null || showing.has(c.parent_id))]
    .map((c) => (ownIds.has(c.id) ? { ...c, own: true } : c))
    .sort(byTime);

  return NextResponse.json(
    {
      open: open.data === true,
      signedIn: Boolean(user),
      comments: merged,
      mine: held,
    },
    { headers: NO_STORE },
  );
}
