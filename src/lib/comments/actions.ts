"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { callClaude, SHORT_TOKENS } from "@/lib/ai/claude";
import { PROMPT } from "@/lib/ai/prompts/comment-screen";
import { commentScreenSchema } from "@/lib/ai/schemas";
import { getSession } from "@/lib/auth/session";
import { rateLimit } from "@/lib/http/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAnonClient } from "@/lib/supabase/anon";

import { decideCommentStatus, type ScreenFlag } from "./status";

export type CommentResult = { ok: true; message: string } | { ok: false; message: string };

const WAIT = "You have posted a few comments recently. Please wait a little while before posting again.";
const FAILED = "Your comment could not be posted. Please try again.";

const postSchema = z.object({
  articleId: z.uuid(),
  parentId: z.uuid().nullable(),
  body: z.string().max(5000),
});

// Burst brake only. The limit that counts is in post_comment, in the database.
const BURST = { limit: 5, windowMs: 10 * 60 * 1000 };

async function storyPath(articleId: string): Promise<string | null> {
  const anon = createAnonClient();
  if (!anon) return null;
  const { data } = await anon
    .from("articles")
    .select("slug, sections(slug)")
    .eq("id", articleId)
    .maybeSingle<{ slug: string; sections: { slug: string } | null }>();
  return data?.sections ? `/${data.sections.slug}/${data.slug}` : null;
}

// The assistant reads the comment as data. Null means it was missing, failed or returned nothing usable.
async function screen(body: string): Promise<ScreenFlag[] | null> {
  const result = await callClaude({
    instructions: PROMPT,
    article: body,
    schema: commentScreenSchema,
    maxTokens: SHORT_TOKENS,
  });
  return result.ok ? result.data.flags : null;
}

export async function postComment(input: { articleId: string; parentId: string | null; body: string }): Promise<CommentResult> {
  const parsed = postSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: FAILED };
  const { articleId, parentId, body } = parsed.data;

  const { supabase, user } = await getSession();
  if (!user) return { ok: false, message: "Sign in to comment." };
  if (!rateLimit(`comment:${user.id}`, BURST.limit, BURST.windowMs)) return { ok: false, message: WAIT };

  const { data: id, error } = await supabase.rpc("post_comment", {
    p_article_id: articleId,
    p_parent_id: parentId,
    p_body: body,
  });
  if (error || typeof id !== "string") {
    const text = error?.message ?? "";
    if (text === "too many comments") return { ok: false, message: WAIT };
    if (text === "comments closed") return { ok: false, message: "Comments are closed on this story." };
    if (text === "invalid comment") return { ok: false, message: "Write 1 to 1000 characters, without angle brackets." };
    if (text === "invalid parent") return { ok: false, message: "That comment can no longer be replied to." };
    if (text === "not allowed") return { ok: false, message: "You can't post comments right now." };
    return { ok: false, message: FAILED };
  }

  // Everything below can fail and the comment still stays pending, which is the safe outcome.
  let flags: ScreenFlag[] | null = null;
  try {
    flags = await screen(body);
  } catch {
    flags = null;
  }
  // The shadow ban is applied by the database, which can see it; this side only asks for less.
  const { count } = await supabase
    .from("comments")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", user.id)
    .eq("status", "published");
  const decision = decideCommentStatus({ flags, publishedOthers: count ?? 0, shadowBanned: false });

  try {
    const { data: final } = await createAdminClient().rpc("apply_comment_screen", {
      p_comment_id: id,
      p_flags: decision.flags,
      p_publish: decision.status === "published",
    });
    if (final === "published") {
      const path = await storyPath(articleId);
      if (path) revalidatePath(path);
    }
  } catch {
    // Not configured or unreachable: the comment stays pending.
  }
  return { ok: true, message: "Thanks. Your comment is being reviewed before it appears." };
}

export async function reportComment(input: { commentId: string; reason: string }): Promise<CommentResult> {
  const parsed = z.object({ commentId: z.uuid(), reason: z.string().trim().min(1).max(500) }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Say briefly what is wrong with the comment." };
  const { supabase, user } = await getSession();
  if (!user) return { ok: false, message: "Sign in to report a comment." };
  if (!rateLimit(`comment-report:${user.id}`, 10, 60 * 60 * 1000)) return { ok: false, message: WAIT };
  const { error } = await supabase.rpc("report_comment", { p_comment_id: parsed.data.commentId, p_reason: parsed.data.reason });
  if (error) return { ok: false, message: "That comment could not be reported." };
  return { ok: true, message: "Thanks. An editor will take a look." };
}
