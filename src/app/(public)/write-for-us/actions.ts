"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createAnonClient } from "@/lib/supabase/anon";

const applicationSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.email().max(254),
  bio: z.string().trim().min(1).max(2000),
  affiliations: z.string().trim().max(2000),
  sample_links: z.string().trim().max(2000),
});

async function verifyTurnstile(secret: string, token: string, remoteip: string | null) {
  const body = new URLSearchParams({ secret, response: token });
  if (remoteip) body.set("remoteip", remoteip);
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
      signal: AbortSignal.timeout(8000),
    });
    const result = (await response.json()) as { success?: boolean };
    return result.success === true;
  } catch {
    return false;
  }
}

export async function apply(formData: FormData) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) redirect("/write-for-us?error=unavailable");

  const parsed = applicationSchema.safeParse({
    name: formData.get("name") ?? "",
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    bio: formData.get("bio") ?? "",
    affiliations: formData.get("affiliations") ?? "",
    sample_links: formData.get("sample_links") ?? "",
  });
  if (!parsed.success) redirect("/write-for-us?error=invalid");

  const token = formData.get("cf-turnstile-response");
  const requestHeaders = await headers();
  const ip = requestHeaders.get("cf-connecting-ip") ?? requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  if (typeof token !== "string" || !token || !(await verifyTurnstile(secret, token, ip))) {
    redirect("/write-for-us?error=challenge");
  }

  const supabase = createAnonClient();
  if (!supabase) redirect("/write-for-us?error=unavailable");

  // The database fills site_id (eyetoday), allows one pending application per
  // email and at most 3 per email per 24 hours.
  const { error } = await supabase.from("contributor_applications").insert({
    name: parsed.data.name,
    email: parsed.data.email,
    bio: parsed.data.bio,
    affiliations: parsed.data.affiliations || null,
    sample_links: parsed.data.sample_links || null,
    status: "pending",
  });

  // A duplicate pending application or the rate limit gets the same message as
  // success, so the form never reveals whether an email has applied before.
  const limited = error && (error.code === "23505" || error.message === "too many applications");
  if (error && !limited) {
    console.error("write-for-us: insert failed", error.code);
    redirect("/write-for-us?error=failed");
  }
  redirect("/write-for-us?submitted=1");
}
