"use server";

import { createHash } from "node:crypto";
import { z } from "zod";

import { callClaude, LONG_TOKENS, SHORT_TOKENS } from "@/lib/ai/claude";
import * as claims from "@/lib/ai/prompts/claims";
import * as copyEditPrompt from "@/lib/ai/prompts/copy-edit";
import * as dek from "@/lib/ai/prompts/dek";
import * as headlines from "@/lib/ai/prompts/headlines";
import * as seo from "@/lib/ai/prompts/seo";
import * as summary from "@/lib/ai/prompts/summary";
import * as tags from "@/lib/ai/prompts/tags";
import {
  type AiKind,
  type Claims,
  claimsSchema,
  type CopyEdit,
  copyEditSchema,
  type Dek,
  dekSchema,
  filterTagSlugs,
  type Headlines,
  headlinesSchema,
  keepQuotedItems,
  type Seo,
  seoSchema,
  type SiteTag,
  type Summary,
  summarySchema,
  type TagPick,
  tagsSchema,
} from "@/lib/ai/schemas";
import { loadStyleGuide } from "@/lib/ai/style-guide";
import { cleanLine, cutBody, htmlToPlainText } from "@/lib/ai/text";
import { getEditorContext } from "@/lib/auth/editor";

const NOT_EDITOR = "Only editors can use the assistant.";
const NO_ARTICLE = "The assistant couldn't open that article.";
const UNAVAILABLE = "The assistant is unavailable. Nothing was changed.";
const LIMIT = 20;
const RATE_LIMITED = `The assistant is limited to ${LIMIT} requests a minute.`;

export type AiRun<T> =
  | { ok: true; suggestionId: string; kind: AiKind; model: string; promptVersion: string; output: T }
  | { ok: false; error: string };

export type TagsOutput = { tags: TagPick[] };

export type AcceptResult =
  | { ok: true; id: string; kind: AiKind; model: string; promptVersion: string; output: unknown }
  | { ok: false; error: string };

type Prompt = { PROMPT: string; PROMPT_VERSION: string };

// Shared path for every kind: editor check, load the saved article, rate limit, one API call,
// then the audit row. Nothing here touches the article.
async function run<S extends z.ZodType, T>(spec: {
  articleId: string;
  kind: AiKind;
  prompt: Prompt;
  schema: S;
  maxTokens: number;
  withStyleGuide?: boolean;
  withSiteTags?: boolean;
  // Turns the validated model output into what is stored and returned.
  shape: (data: z.output<S>, ctx: { bodyText: string; siteTags: SiteTag[] }) => T;
}): Promise<AiRun<T>> {
  const ctx = await getEditorContext();
  if (!ctx) return { ok: false, error: NOT_EDITOR };

  const id = z.uuid().safeParse(spec.articleId);
  if (!id.success) return { ok: false, error: NO_ARTICLE };

  const { data: article } = await ctx.supabase
    .from("articles")
    .select("id, site_id, title, dek, body_html")
    .eq("id", id.data)
    .maybeSingle<{ id: string; site_id: string; title: string; dek: string | null; body_html: string | null }>();
  if (!article) return { ok: false, error: NO_ARTICLE };

  const since = new Date(Date.now() - 60_000).toISOString();
  const { count, error: countError } = await ctx.supabase
    .from("ai_suggestions")
    .select("id", { count: "exact", head: true })
    .eq("requested_by", ctx.userId)
    .gte("created_at", since);
  if (countError) return { ok: false, error: UNAVAILABLE };
  if ((count ?? 0) >= LIMIT) return { ok: false, error: RATE_LIMITED };

  const title = cleanLine(article.title);
  const dekText = cleanLine(article.dek);
  const bodyText = cutBody(htmlToPlainText(article.body_html));

  let siteTags: SiteTag[] = [];
  if (spec.withSiteTags) {
    const { data } = await ctx.supabase.from("tags").select("id, slug, name").eq("site_id", article.site_id).order("slug");
    siteTags = (data ?? []) as SiteTag[];
  }

  const call = await callClaude({
    instructions: spec.prompt.PROMPT,
    styleGuide: spec.withStyleGuide ? await loadStyleGuide() : undefined,
    article: `Title: ${title}\nDek: ${dekText}\nBody:\n${bodyText}`,
    extra: spec.withSiteTags ? `Allowed tag slugs:\n${siteTags.map((t) => `- ${t.slug}`).join("\n") || "(none)"}` : undefined,
    schema: spec.schema,
    maxTokens: spec.maxTokens,
  });
  if (!call.ok) return { ok: false, error: call.error };

  const output = spec.shape(call.data, { bodyText, siteTags });
  const inputHash = createHash("sha256")
    .update(JSON.stringify([spec.kind, spec.prompt.PROMPT_VERSION, title, dekText, bodyText]))
    .digest("hex");

  const { data: row, error } = await ctx.supabase
    .from("ai_suggestions")
    .insert({
      site_id: article.site_id,
      article_id: article.id,
      kind: spec.kind,
      prompt_version: spec.prompt.PROMPT_VERSION,
      model: call.model,
      input_hash: inputHash,
      output_json: output,
      requested_by: ctx.userId,
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !row) return { ok: false, error: UNAVAILABLE };

  return {
    ok: true,
    suggestionId: row.id,
    kind: spec.kind,
    model: call.model,
    promptVersion: spec.prompt.PROMPT_VERSION,
    output,
  };
}

export async function suggestHeadlines(articleId: string): Promise<AiRun<Headlines>> {
  return run({ articleId, kind: "headlines", prompt: headlines, schema: headlinesSchema, maxTokens: SHORT_TOKENS, shape: (d) => d });
}

export async function suggestDek(articleId: string): Promise<AiRun<Dek>> {
  return run({ articleId, kind: "dek", prompt: dek, schema: dekSchema, maxTokens: SHORT_TOKENS, shape: (d) => d });
}

export async function suggestSeo(articleId: string): Promise<AiRun<Seo>> {
  return run({ articleId, kind: "seo", prompt: seo, schema: seoSchema, maxTokens: SHORT_TOKENS, shape: (d) => d });
}

// Only slugs the site already has survive; the ids come from the site's own rows. Never inserts a tag.
export async function suggestTags(articleId: string): Promise<AiRun<TagsOutput>> {
  return run({
    articleId,
    kind: "tags",
    prompt: tags,
    schema: tagsSchema,
    maxTokens: SHORT_TOKENS,
    withSiteTags: true,
    shape: (d, { siteTags }) => ({ tags: filterTagSlugs(d.slugs, siteTags) }),
  });
}

// Quotes that are not in the text that was sent are dropped, so every item can be found in the body.
export async function copyEdit(articleId: string): Promise<AiRun<CopyEdit>> {
  return run({
    articleId,
    kind: "copy_edit",
    prompt: copyEditPrompt,
    schema: copyEditSchema,
    maxTokens: LONG_TOKENS,
    withStyleGuide: true,
    shape: (d, { bodyText }) => ({ items: keepQuotedItems(d.items, bodyText) }),
  });
}

export async function claimsCheck(articleId: string): Promise<AiRun<Claims>> {
  return run({ articleId, kind: "claims", prompt: claims, schema: claimsSchema, maxTokens: LONG_TOKENS, withStyleGuide: true, shape: (d) => d });
}

export async function suggestSummary(articleId: string): Promise<AiRun<Summary>> {
  return run({ articleId, kind: "summary", prompt: summary, schema: summarySchema, maxTokens: SHORT_TOKENS, withStyleGuide: true, shape: (d) => d });
}

type SuggestionRow = { id: string; kind: AiKind; model: string; prompt_version: string; output_json: unknown; accepted_by: string | null };

// Records who accepted a run. Writes only accepted_by / accepted_at on the suggestion row: it does not
// touch the article, its status or the public cache. The editor still presses Save.
export async function acceptSuggestion(suggestionId: string): Promise<AcceptResult> {
  const ctx = await getEditorContext();
  if (!ctx) return { ok: false, error: NOT_EDITOR };

  const id = z.uuid().safeParse(suggestionId);
  if (!id.success) return { ok: false, error: "That suggestion could not be found." };

  const columns = "id, kind, model, prompt_version, output_json, accepted_by";
  const { data: updated } = await ctx.supabase
    .from("ai_suggestions")
    .update({ accepted_by: ctx.userId, accepted_at: new Date().toISOString() })
    .eq("id", id.data)
    .is("accepted_by", null)
    .select(columns)
    .maybeSingle<SuggestionRow>();

  let row = updated;
  if (!row) {
    // Already accepted by this editor (a second copy-edit item from the same run) is fine.
    const { data: existing } = await ctx.supabase.from("ai_suggestions").select(columns).eq("id", id.data).maybeSingle<SuggestionRow>();
    if (!existing) return { ok: false, error: "That suggestion could not be found." };
    if (existing.accepted_by !== ctx.userId) return { ok: false, error: "That suggestion was already accepted by someone else." };
    row = existing;
  }

  return { ok: true, id: row.id, kind: row.kind, model: row.model, promptVersion: row.prompt_version, output: row.output_json };
}
