"use server";

import { z } from "zod";

import { getEditorContext } from "@/lib/auth/editor";
import { EXTENSION_FOR, readDimensions, sniffRaster } from "@/lib/media/sniff";
import { getSiteId } from "@/lib/site";

const registerSchema = z.object({
  path: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|gif)$/),
  alt: z.string().trim().min(1).max(300),
  credit: z.string().trim().min(1).max(200),
  caption: z.string().trim().min(1).max(500),
});

export type RegisterMediaResult = { ok: true; id: string } | { ok: false; error: string };

// Called after the browser has uploaded the file to the media bucket. Checks
// the stored object's real bytes, then records it. Rejected objects are removed.
export async function registerMedia(input: unknown): Promise<RegisterMediaResult> {
  const ctx = await getEditorContext();
  if (!ctx) return { ok: false, error: "Only editors can add media." };

  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Alt text, credit and caption are all required." };
  const { path, alt, credit, caption } = parsed.data;

  const bucket = ctx.supabase.storage.from("media");
  const { data: blob, error: downloadError } = await bucket.download(path);
  if (downloadError || !blob) return { ok: false, error: "The uploaded file could not be read." };

  const bytes = new Uint8Array(await blob.arrayBuffer());
  const type = sniffRaster(bytes);
  const dimensions = type ? readDimensions(bytes) : null;
  if (!type || !dimensions || path.split(".").pop() !== EXTENSION_FOR[type]) {
    await bucket.remove([path]);
    return { ok: false, error: "Only JPEG, PNG, WebP or GIF images are allowed." };
  }

  const siteId = await getSiteId(ctx.supabase);
  if (!siteId) return { ok: false, error: "No site is set up yet." };

  const { data, error } = await ctx.supabase
    .from("media")
    .insert({ site_id: siteId, storage_path: path, owner_id: ctx.userId, alt, credit, caption, ...dimensions })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) {
    await bucket.remove([path]);
    return { ok: false, error: "The image could not be saved." };
  }
  return { ok: true, id: data.id };
}
