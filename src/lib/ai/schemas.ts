import { z } from "zod";

// Model output shapes. The API does not enforce max length, so these run after every call.
// No server-only import: the tests load this file directly.

export const AI_KINDS = ["headlines", "dek", "seo", "tags", "copy_edit", "claims", "summary"] as const;
export type AiKind = (typeof AI_KINDS)[number];

// Plain text: trimmed, non-empty, and no angle brackets, so it can never carry markup.
const plain = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((s) => !/[<>]/.test(s), { message: "must be plain text" });

export const headlinesSchema = z.object({ headlines: z.array(plain(200)).min(1).max(5) });
export const dekSchema = z.object({ dek: plain(400) });
export const seoSchema = z.object({ seo_title: plain(120), seo_description: plain(320) });
export const introSchema = z.object({ intro: plain(600) });
export const tagsSchema = z.object({ slugs: z.array(z.string().trim().min(1).max(120)).max(30) });
export const copyEditSchema = z.object({
  items: z.array(z.object({ quote: plain(500), suggestion: plain(500), reason: plain(300) })).max(20),
});
export const CLAIM_KINDS = ["medical", "legal", "statistic"] as const;
export const claimsSchema = z.object({
  items: z.array(z.object({ sentence: plain(500), kind: z.enum(CLAIM_KINDS), reason: plain(300) })).max(20),
});
export const summarySchema = z.object({ points: z.array(plain(200)).min(1).max(5) });

export type Headlines = z.infer<typeof headlinesSchema>;
export type Dek = z.infer<typeof dekSchema>;
export type Seo = z.infer<typeof seoSchema>;
export type CopyEdit = z.infer<typeof copyEditSchema>;
export type Claims = z.infer<typeof claimsSchema>;
export type Summary = z.infer<typeof summarySchema>;

export type SiteTag = { id: string; slug: string; name: string };
export type TagPick = { id: string; slug: string; name: string };

// The model may only choose tags the site already has. Anything else is dropped, and
// repeats collapse. Returns the site's own rows, never the model's spelling.
export function filterTagSlugs(returned: readonly string[], siteTags: readonly SiteTag[]): TagPick[] {
  const bySlug = new Map(siteTags.map((t) => [t.slug, t]));
  const seen = new Set<string>();
  const picks: TagPick[] = [];
  for (const raw of returned) {
    const tag = bySlug.get(raw.trim());
    if (!tag || seen.has(tag.id)) continue;
    seen.add(tag.id);
    picks.push({ id: tag.id, slug: tag.slug, name: tag.name });
  }
  return picks;
}

// Keep only copy-edit items whose quote appears in the text that was sent.
export function keepQuotedItems<T extends { quote: string }>(items: readonly T[], sentText: string): T[] {
  return items.filter((i) => sentText.includes(i.quote));
}
