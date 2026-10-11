import { readFile } from "node:fs/promises";
import path from "node:path";

import { EXTENSION_FOR, readDimensions, sniffRaster } from "@/lib/media/sniff";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

type Item = { file: string; key: string; alt: string; credit: string; caption: string };

// ONE-SHOT demo seed. Imports the images committed under public/seed-media into the media bucket and
// records them. Each file goes to a fixed object path, seed/<key>.<ext>, and media has a unique index on
// (site_id, storage_path), so the insert itself is the lock: a second call, or two concurrent ones, can
// never create a duplicate row or object (upsert: false refuses a second object too). There is nothing to
// pass in: it can only ever import the files in this build. Remove this route once the demo content is in.
export async function POST() {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  let db;
  try {
    db = createAdminClient();
  } catch {
    return Response.json({ error: "unavailable" }, { status: 503, headers });
  }
  const { data: site } = await db.from("sites").select("id").eq("slug", "eyetoday").maybeSingle<{ id: string }>();
  if (!site) return Response.json({ error: "no site" }, { status: 500, headers });

  const dir = path.join(process.cwd(), "public", "seed-media");
  const manifest = JSON.parse(await readFile(path.join(dir, "manifest.json"), "utf8")) as Item[];
  const { data: existing } = await db.from("media").select("id, storage_path").like("storage_path", "seed/%").returns<{ id: string; storage_path: string }[]>();
  const done = new Map((existing ?? []).map((row) => [row.storage_path.slice(5).replace(/\.[a-z]+$/, ""), row.id]));

  const result: Record<string, string> = {};
  for (const item of manifest) {
    if (done.has(item.key)) {
      result[item.key] = done.get(item.key)!;
      continue;
    }
    const bytes = new Uint8Array(await readFile(path.join(dir, item.file)));
    const type = sniffRaster(bytes);
    const dimensions = type ? readDimensions(bytes) : null;
    if (!type || !dimensions) {
      result[item.key] = "rejected";
      continue;
    }
    const objectPath = `seed/${item.key}.${EXTENSION_FOR[type]}`;
    const { error: uploadError } = await db.storage
      .from("media")
      .upload(objectPath, bytes, { contentType: type, cacheControl: "31536000", upsert: false });
    if (uploadError) {
      result[item.key] = `upload failed: ${uploadError.message}`;
      continue;
    }
    const { data, error } = await db
      .from("media")
      .insert({ site_id: site.id, storage_path: objectPath, alt: item.alt, credit: item.credit, caption: item.caption, ...dimensions })
      .select("id")
      .single<{ id: string }>();
    if (error || !data) {
      // A unique-violation here means another call won the race: leave its object and row alone.
      if (error?.code !== "23505") await db.storage.from("media").remove([objectPath]);
      result[item.key] = `record failed: ${error?.message ?? "unknown"}`;
      continue;
    }
    result[item.key] = data.id;
  }
  return Response.json(result, { headers });
}
