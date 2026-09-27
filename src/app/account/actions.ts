"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

// Profile edits go through the caller's own session. Never import the
// service-role client here, and never send the role column.

const profileSchema = z.object({
  display_name: z.string().trim().min(1).max(80),
  bio: z.string().trim().max(500),
});

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=%2Faccount");
  return { supabase, user };
}

export async function updateProfile(formData: FormData) {
  const { supabase, user } = await requireUser();

  const parsed = profileSchema.safeParse({
    display_name: formData.get("display_name") ?? "",
    bio: formData.get("bio") ?? "",
  });
  if (!parsed.success) redirect("/account?error=invalid_profile");

  const { error } = await supabase
    .from("profiles")
    .update({ display_name: parsed.data.display_name, bio: parsed.data.bio || null })
    .eq("id", user.id);
  if (error) redirect("/account?error=save_failed");

  redirect("/account?saved=profile");
}

// Identify the image from its bytes, not the browser-supplied type. SVG never matches.
function sniffImageType(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && png.every((b, i) => bytes[i] === b)) return "image/png";
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

export async function uploadAvatar(formData: FormData) {
  const { supabase, user } = await requireUser();

  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) redirect("/account?error=avatar_missing");
  if (file.size > MAX_AVATAR_BYTES) redirect("/account?error=avatar_too_large");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const contentType = sniffImageType(bytes);
  if (!contentType) redirect("/account?error=avatar_type");

  const path = `${user.id}/avatar`;
  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, bytes, { contentType, upsert: true, cacheControl: "3600" });
  if (uploadError) redirect("/account?error=avatar_failed");

  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: `${data.publicUrl}?v=${Date.now()}` })
    .eq("id", user.id);
  if (error) redirect("/account?error=avatar_failed");

  redirect("/account?saved=avatar");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
