"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { forwardedIp, rateLimit } from "@/lib/http/rate-limit";
import { verifyTurnstile } from "@/lib/http/turnstile";
import { SLUG_RE } from "@/lib/slug";
import { createClient } from "@/lib/supabase/server";

const reportSchema = z.object({
  slug: z.string().regex(SLUG_RE),
  email: z.email().max(254),
  reason: z.string().trim().min(1).max(2000),
});

function back(slug: string, query: string): never {
  redirect(`/directory/listing/${slug}/report?${query}`);
}

// Turnstile first, then the per-IP limit, then report_listing (which refuses unpublished listings and has
// its own per-email and site-wide caps). A limit reads as success, so the form cannot be used to probe it.
export async function reportListing(formData: FormData) {
  const rawSlug = String(formData.get("slug") ?? "");
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!SLUG_RE.test(rawSlug)) redirect("/directory");
  if (!secret) back(rawSlug, "error=unavailable");

  const parsed = reportSchema.safeParse({
    slug: rawSlug,
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    reason: String(formData.get("reason") ?? ""),
  });
  if (!parsed.success) back(rawSlug, "error=invalid");

  const requestHeaders = await headers();
  const ip = forwardedIp(requestHeaders.get("cf-connecting-ip") ?? requestHeaders.get("x-forwarded-for"));
  const token = formData.get("cf-turnstile-response");
  if (typeof token !== "string" || !token || !(await verifyTurnstile(secret, token, ip === "unknown" ? null : ip))) {
    back(rawSlug, "error=challenge");
  }
  if (!rateLimit(`directory-report:${ip}`, 5, 60 * 60 * 1000)) back(rawSlug, "sent=1");

  const supabase = await createClient();
  const { data: listing } = await supabase.rpc("directory_listing", { slug: parsed.data.slug });
  const id = ((listing ?? []) as { id: string }[])[0]?.id;
  if (!id) redirect("/directory");

  const { error } = await supabase.rpc("report_listing", { p_listing_id: id, p_email: parsed.data.email, p_reason: parsed.data.reason });
  const limited = error && (error.code === "P0001" || error.message === "too many reports");
  if (error && !limited) {
    console.error("directory report failed", error.code);
    back(rawSlug, "error=failed");
  }
  back(rawSlug, "sent=1");
}
