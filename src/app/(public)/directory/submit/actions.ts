"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { forwardedIp, rateLimit } from "@/lib/http/rate-limit";
import { SLUG_RE } from "@/lib/slug";
import { createAnonClient } from "@/lib/supabase/anon";

const submissionSchema = z.object({
  name: z.string().trim().min(1).max(160),
  category_slug: z.string().trim().regex(SLUG_RE),
  country: z.string().trim().regex(/^[A-Za-z]{2}$/),
  region: z.string().trim().max(80),
  city: z.string().trim().max(80),
  services: z.string().trim().max(1000),
  languages: z.string().trim().max(500),
  website: z.string().trim().max(300).refine((value) => value === "" || /^https:\/\/\S+$/.test(value)),
  public_email: z.string().trim().max(254).refine((value) => value === "" || z.email().safeParse(value).success),
  public_phone: z.string().trim().max(40),
  description: z.string().trim().max(2000),
  contact_email: z.email().max(254),
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

export async function submitListing(formData: FormData) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) redirect("/directory/submit?error=unavailable");

  const parsed = submissionSchema.safeParse({
    name: formData.get("name") ?? "",
    category_slug: formData.get("category") ?? "",
    country: formData.get("country") ?? "",
    region: formData.get("region") ?? "",
    city: formData.get("city") ?? "",
    services: formData.get("services") ?? "",
    languages: formData.get("languages") ?? "",
    website: formData.get("website") ?? "",
    public_email: formData.get("public_email") ?? "",
    public_phone: formData.get("public_phone") ?? "",
    description: formData.get("description") ?? "",
    contact_email: String(formData.get("contact_email") ?? "").trim().toLowerCase(),
  });
  if (!parsed.success) redirect("/directory/submit?error=invalid");

  const requestHeaders = await headers();
  const ip = forwardedIp(requestHeaders.get("cf-connecting-ip") ?? requestHeaders.get("x-forwarded-for"));
  const token = formData.get("cf-turnstile-response");
  if (typeof token !== "string" || !token || !(await verifyTurnstile(secret, token, ip === "unknown" ? null : ip))) {
    redirect("/directory/submit?error=challenge");
  }
  if (!rateLimit(`directory-submit:${ip}`, 5, 60 * 60 * 1000)) {
    redirect("/directory/submit?submitted=1");
  }

  const supabase = createAnonClient();
  if (!supabase) redirect("/directory/submit?error=unavailable");

  const { error } = await supabase.rpc("submit_directory_listing", {
    p_name: parsed.data.name,
    p_category_slug: parsed.data.category_slug,
    p_country: parsed.data.country,
    p_region: parsed.data.region,
    p_city: parsed.data.city,
    p_services: parsed.data.services,
    p_languages: parsed.data.languages,
    p_website: parsed.data.website,
    p_public_email: parsed.data.public_email,
    p_public_phone: parsed.data.public_phone,
    p_description: parsed.data.description,
    p_contact_email: parsed.data.contact_email,
  });

  const limited = error && (error.code === "P0001" || error.message === "too many submissions");
  if (error && !limited) {
    console.error("directory submit failed", error.code);
    redirect("/directory/submit?error=failed");
  }
  redirect("/directory/submit?submitted=1");
}
