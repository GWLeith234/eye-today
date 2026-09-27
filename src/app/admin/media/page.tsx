import { requireArea } from "@/lib/auth/session";
import { mediaUrl } from "@/lib/media/url";

import { MediaUploader } from "./media-uploader";

type MediaRow = { id: string; storage_path: string; alt: string | null; credit: string | null; caption: string | null; width: number | null; height: number | null };

export default async function MediaPage() {
  const { supabase } = await requireArea("admin");
  const { data } = await supabase
    .from("media")
    .select("id, storage_path, alt, credit, caption, width, height")
    .order("created_at", { ascending: false })
    .limit(100)
    .returns<MediaRow[]>();

  return (
    <main className="flex flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold">Media</h1>
      <MediaUploader />
      <ul className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {(data ?? []).map((item) => (
          <li key={item.id} className="flex flex-col gap-1 text-xs">
            {/* eslint-disable-next-line @next/next/no-img-element -- Supabase Storage URL */}
            <img src={mediaUrl(item.storage_path, { width: 400 })} alt={item.alt ?? ""} className="aspect-video w-full rounded object-cover" />
            <span>{item.caption}</span>
            <span className="opacity-60">
              {item.credit} · {item.width}×{item.height}
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
