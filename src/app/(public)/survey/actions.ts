"use server";

import { createHash } from "node:crypto";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { forwardedIp, rateLimit } from "@/lib/http/rate-limit";
import { verifyTurnstile } from "@/lib/http/turnstile";
import { readAnswers } from "@/lib/survey/model";
import { createAnonClient } from "@/lib/supabase/anon";

// One response per form post. Turnstile first, then a per-address limit, then the definer function. The
// address is stored only as a salted hash, the same rule as article views.
export async function submitSurvey(formData: FormData) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) redirect("/survey?error=unavailable");

  const answers = readAnswers(Object.fromEntries(formData.entries()));
  if (!answers) redirect("/survey?error=empty");
  const email = z.email().max(254).safeParse(String(formData.get("email") ?? "").trim().toLowerCase());

  const requestHeaders = await headers();
  const ip = forwardedIp(requestHeaders.get("cf-connecting-ip") ?? requestHeaders.get("x-forwarded-for"));
  const token = formData.get("cf-turnstile-response");
  if (typeof token !== "string" || !token || !(await verifyTurnstile(secret, token, ip === "unknown" ? null : ip))) {
    redirect("/survey?error=challenge");
  }
  if (!rateLimit(`survey:${ip}`, 3, 24 * 60 * 60 * 1000)) redirect("/survey?done=1");

  const supabase = createAnonClient();
  if (!supabase) redirect("/survey?error=unavailable");
  const salt = process.env.VIEW_HASH_SALT || "eye-today-view";
  const ipHash = createHash("sha256").update(`${salt}:${ip}`).digest("hex");
  const { error } = await supabase.rpc("submit_reader_survey", { p_answers: answers, p_email: email.success ? email.data : null, p_ip_hash: ipHash });
  if (error) {
    console.error("survey submit failed", error.code);
    redirect("/survey?error=unavailable");
  }
  redirect("/survey?done=1");
}
