"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { loginPath, safeNextPath } from "@/lib/auth/access";
import { originFromHeaders } from "@/lib/auth/origin";
import { createClient } from "@/lib/supabase/server";

const magicLinkSchema = z.object({
  email: z.email().max(254),
  next: z.string().optional(),
});

function callbackUrl(origin: string, next: string) {
  return `${origin}/auth/callback?next=${encodeURIComponent(next)}`;
}

function withError(next: string, error: string) {
  return `${loginPath(next)}&error=${error}`;
}

export async function sendMagicLink(formData: FormData) {
  const next = safeNextPath(formData.get("next"));
  const parsed = magicLinkSchema.safeParse({
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    next,
  });
  if (!parsed.success) redirect(withError(next, "invalid_email"));

  const origin = originFromHeaders(await headers());
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { emailRedirectTo: callbackUrl(origin, next) },
  });
  if (error) redirect(withError(next, "send_failed"));

  redirect(`${loginPath(next)}&sent=1`);
}

export async function signInWithGoogle(formData: FormData) {
  const next = safeNextPath(formData.get("next"));
  const origin = originFromHeaders(await headers());
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callbackUrl(origin, next) },
  });
  if (error || !data.url) redirect(withError(next, "google_unavailable"));

  redirect(data.url);
}
