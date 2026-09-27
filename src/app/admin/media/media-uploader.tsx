"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { createClient } from "@/lib/supabase/browser";

import { registerMedia } from "./actions";

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};
const MAX_BYTES = 8 * 1024 * 1024;

export function MediaUploader() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("file");
    if (!(file instanceof File) || file.size === 0) return setMessage({ kind: "error", text: "Choose an image." });
    const ext = EXTENSIONS[file.type];
    if (!ext) return setMessage({ kind: "error", text: "Only JPEG, PNG, WebP or GIF images are allowed." });
    if (file.size > MAX_BYTES) return setMessage({ kind: "error", text: "Images must be 8 MB or smaller." });

    setBusy(true);
    setMessage(null);
    try {
      const path = `${crypto.randomUUID()}.${ext}`;
      // Straight to Storage with the signed-in session; the file never passes through a server action.
      const { error } = await createClient().storage.from("media").upload(path, file, { contentType: file.type });
      if (error) return setMessage({ kind: "error", text: "Upload failed. Please try again." });

      const result = await registerMedia({
        path,
        alt: data.get("alt"),
        credit: data.get("credit"),
        caption: data.get("caption"),
      });
      if (!result.ok) return setMessage({ kind: "error", text: result.error });
      form.reset();
      setMessage({ kind: "ok", text: "Image added." });
      router.refresh();
    } catch {
      setMessage({ kind: "error", text: "Upload failed (network or server error). Please try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded border p-4">
      <h2 className="font-semibold">Upload an image</h2>
      <input type="file" name="file" accept="image/jpeg,image/png,image/webp,image/gif" required />
      <label className="flex flex-col gap-1 text-sm">
        Alt text
        <input name="alt" required maxLength={300} className="rounded border px-2 py-1" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Credit
        <input name="credit" required maxLength={200} className="rounded border px-2 py-1" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Caption
        <input name="caption" required maxLength={500} className="rounded border px-2 py-1" />
      </label>
      <button type="submit" disabled={busy} className="self-start rounded bg-foreground px-3 py-1 text-background disabled:opacity-50">
        {busy ? "Uploading…" : "Upload"}
      </button>
      {message ? (
        <p role={message.kind === "ok" ? "status" : "alert"} className="text-sm">
          {message.text}
        </p>
      ) : null}
    </form>
  );
}
