"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getEditorContext } from "@/lib/auth/editor";
import { rateLimit } from "@/lib/http/rate-limit";
import { BLURB_MAX, cleanBlurb, cleanLinkUrl, cleanTitle, isPrivateHost, type LinkPreview, parseLinkPreview, parseTags } from "@/lib/newsroom/model";
import { getSiteId } from "@/lib/site";

export type SaveState = { error: string | null };

const schema = z.object({
  id: z.uuid().or(z.literal("")),
  url: z.string().trim().min(1).max(2000),
  title: z.string().trim().min(1).max(200),
  source_name: z.string().trim().min(1).max(120),
  published_on: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  blurb: z.string().max(BLURB_MAX + 200),
  tags: z.string().max(1000),
  status: z.enum(["draft", "published"]),
});

function refreshFeed() {
  revalidatePath("/news-feed");
  revalidatePath("/");
}

export async function saveNewsLink(_state: SaveState, formData: FormData): Promise<SaveState> {
  const ctx = await getEditorContext();
  if (!ctx) return { error: "Your session has expired. Sign in again." };
  const parsed = schema.safeParse({
    id: formData.get("id") ?? "",
    url: formData.get("url") ?? "",
    title: formData.get("title") ?? "",
    source_name: formData.get("source_name") ?? "",
    published_on: formData.get("published_on") ?? "",
    blurb: formData.get("blurb") ?? "",
    tags: formData.get("tags") ?? "",
    status: formData.get("status") ?? "draft",
  });
  if (!parsed.success) return { error: "Check the link, headline (up to 200 characters), outlet, date and status." };
  const url = cleanLinkUrl(parsed.data.url);
  if (!url) return { error: "The link must be a full https address." };
  const blurb = cleanBlurb(parsed.data.blurb);
  if (parsed.data.blurb.trim().length > BLURB_MAX) return { error: `Keep the blurb to ${BLURB_MAX} characters, in our own words.` };
  if (parsed.data.status === "published" && !blurb) return { error: "Write a one-line blurb in our own words before publishing." };

  const fields = {
    url,
    title: cleanTitle(parsed.data.title),
    source_name: cleanTitle(parsed.data.source_name).slice(0, 120),
    published_on: parsed.data.published_on,
    blurb,
    tags: parseTags(parsed.data.tags),
    status: parsed.data.status,
  };

  let id = parsed.data.id;
  if (id) {
    const { data, error } = await ctx.supabase.from("news_links").update(fields).eq("id", id).select("id").maybeSingle<{ id: string }>();
    if (error) return { error: error.code === "23505" ? "That link is already in the feed." : "The link could not be saved." };
    if (!data) return { error: "That link could not be found." };
  } else {
    const siteId = await getSiteId(ctx.supabase);
    if (!siteId) return { error: "The site is not available." };
    const { data, error } = await ctx.supabase
      .from("news_links")
      .insert({ ...fields, site_id: siteId, added_by: ctx.userId })
      .select("id")
      .single<{ id: string }>();
    if (error) return { error: error.code === "23505" ? "That link is already in the feed." : "The link could not be added." };
    id = data.id;
  }
  refreshFeed();
  redirect(`/admin/news-feed/${id}?saved=1`);
}

export async function deleteNewsLink(formData: FormData) {
  const ctx = await getEditorContext();
  if (!ctx) redirect("/login");
  const id = z.uuid().safeParse(String(formData.get("id") ?? ""));
  if (!id.success) redirect("/admin/news-feed?error=notfound");
  await ctx.supabase.from("news_links").delete().eq("id", id.data);
  refreshFeed();
  revalidatePath("/admin/news-feed");
  redirect("/admin/news-feed?done=deleted");
}

// One fetch on an editor's click, text only, never stored until the editor saves the form. Private and
// loopback hosts are refused so the server cannot be pointed at itself; the body is capped at 512 KB.
export async function fetchLinkPreview(raw: string): Promise<{ ok: true; preview: LinkPreview } | { ok: false; error: string }> {
  const ctx = await getEditorContext();
  if (!ctx) return { ok: false, error: "Your session has expired. Sign in again." };
  const url = cleanLinkUrl(raw);
  if (!url) return { ok: false, error: "Paste a full https address first." };
  if (isPrivateHost(new URL(url).hostname)) return { ok: false, error: "That address cannot be fetched." };
  if (!rateLimit(`link-preview:${ctx.userId}`, 20, 60_000) || !rateLimit("link-preview:all", 2, 1100)) {
    return { ok: false, error: "Wait a moment and try again." };
  }
  const origin = process.env.SITE_URL?.trim().replace(/\/+$/, "") || "https://theeye.today";

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": `EyeTodayNewsroom/1.0 (+${origin})`, Accept: "text/html,application/xhtml+xml", "Accept-Language": "en" },
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return { ok: false, error: `The page answered ${response.status}. Fill the details in by hand.` };
    const type = response.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml/i.test(type)) return { ok: false, error: "That link is not a web page. Fill the details in by hand." };
    const reader = response.body?.getReader();
    if (!reader) return { ok: false, error: "The page could not be read." };
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (size < 524_288) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      size += value.byteLength;
    }
    await reader.cancel().catch(() => undefined);
    const html = new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks.map((c) => Buffer.from(c))));
    const preview = parseLinkPreview(html, response.url || url);
    if (!preview.title) return { ok: false, error: "No headline found on that page. Fill the details in by hand." };
    return { ok: true, preview };
  } catch {
    return { ok: false, error: "The page did not answer. Fill the details in by hand." };
  }
}
