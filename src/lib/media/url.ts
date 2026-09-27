// Public URLs for objects in the media bucket. With image transforms enabled
// on the Supabase project, a width gives a resized rendition; otherwise the
// original object is returned.

export function mediaUrl(storagePath: string, options?: { width?: number }) {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
  const path = storagePath.split("/").map(encodeURIComponent).join("/");
  if (options?.width && process.env.NEXT_PUBLIC_SUPABASE_IMAGE_TRANSFORMS === "true") {
    return `${base}/storage/v1/render/image/public/media/${path}?width=${options.width}&resize=contain`;
  }
  return `${base}/storage/v1/object/public/media/${path}`;
}
