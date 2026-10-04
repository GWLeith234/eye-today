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
};
type Mine = { id: string; parent_id: string | null; body: string; created_at: string; status: string; reject_reason: string | null };

const NO_STORE = { "Cache-Control": "no-store" };

// Read with the visitor's own session. Held and rejected comments are theirs alone, so this is never cached.
export async function GET(request: Request) {
  const article = z.uuid().safeParse(new URL(request.url).searchParams.get("article"));
  if (!article.success) return NextResponse.json({ error: "invalid" }, { status: 400, headers: NO_STORE });

  const { supabase, user } = await getSession();
  const [open, published, mine] = await Promise.all([
    supabase.rpc("comments_open", { p_article_id: article.data }),
    supabase.rpc("comments_for_article", { p_article_id: article.data }),
    user ? supabase.rpc("comments_for_author", { p_article_id: article.data }) : Promise.resolve({ data: [] }),
  ]);
  return NextResponse.json(
    {
      open: open.data === true,
      signedIn: Boolean(user),
      comments: (published.data ?? []) as Published[],
      mine: (mine.data ?? []) as Mine[],
    },
    { headers: NO_STORE },
  );
}
