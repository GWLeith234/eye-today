"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { forwardedIp, rateLimit } from "@/lib/http/rate-limit";
import { verifyTurnstile } from "@/lib/http/turnstile";
import { SLUG_RE } from "@/lib/slug";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  contest: z.uuid(),
  slug: z.string().regex(SLUG_RE),
  name: z.string().trim().min(1).max(120),
  email: z.email().max(254),
  answer: z.string().trim().max(1000),
  consent: z.literal("yes"),
});

export async function enterContest(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const back = SLUG_RE.test(slug) ? `/contests/${slug}` : "/contests";
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) redirect(`${back}?error=unavailable`);

  const parsed = schema.safeParse({
    contest: formData.get("contest") ?? "",
    slug,
    name: formData.get("name") ?? "",
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    answer: formData.get("answer") ?? "",
    consent: formData.get("consent") ?? "",
  });
  if (!parsed.success) redirect(`${back}?error=invalid`);

  const requestHeaders = await headers();
  const ip = forwardedIp(requestHeaders.get("cf-connecting-ip") ?? requestHeaders.get("x-forwarded-for"));
  const token = formData.get("cf-turnstile-response");
  if (typeof token !== "string" || !token || !(await verifyTurnstile(secret, token, ip === "unknown" ? null : ip))) {
    redirect(`${back}?error=challenge`);
  }
  if (!rateLimit(`contest-entry:${ip}`, 10, 60 * 60 * 1000)) redirect(`${back}?error=limited`);

  // The user-scoped client, so a signed-in entrant's profile is linked; enter_contest works signed out too.
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("enter_contest", {
    p_contest: parsed.data.contest,
    p_name: parsed.data.name,
    p_email: parsed.data.email,
    p_answer: parsed.data.answer,
    p_consent: true,
  });
  if (error) {
    if (error.code !== "23514" && error.code !== "P0001") console.error("contest entry failed", error.code);
    redirect(`${back}?error=${error.code === "P0001" ? "limited" : error.code === "23514" ? "invalid" : "failed"}`);
  }
  redirect(`${back}?entered=${data === "duplicate" ? "again" : data === "closed" ? "closed" : "1"}`);
}
