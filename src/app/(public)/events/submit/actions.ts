"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { loginPath } from "@/lib/auth/access";
import { parseEventForm } from "@/lib/events/form";
import { forwardedIp, rateLimit } from "@/lib/http/rate-limit";
import { verifyTurnstile } from "@/lib/http/turnstile";
import { createClient } from "@/lib/supabase/server";

const DAY = 24 * 60 * 60 * 1000;

function rpcArgs(data: Exclude<ReturnType<typeof parseEventForm>, { ok: false }>["data"], description: string) {
  return {
    p_title: data.title,
    p_event_type: data.event_type,
    p_attendance: data.attendance,
    p_starts_at: data.starts_at,
    p_ends_at: data.ends_at,
    p_tz: data.tz,
    p_venue: data.venue,
    p_country: data.country,
    p_city: data.city,
    p_organiser_name: data.organiser_name,
    p_price_note: data.price_note,
    p_registration_url: data.registration_url,
    p_description: description,
    p_listing_slug: data.listing_slug,
  };
}

function failure(code: string | undefined, message: string | undefined): string {
  if (code === "P0001" || message === "too many submissions") return "limited";
  if (message === "invalid listing") return "listing";
  if (code === "23514") return "invalid";
  return "failed";
}

export async function submitEvent(formData: FormData) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) redirect("/events/submit?error=unavailable");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(loginPath("/events/submit"));

  const form = parseEventForm(formData);
  if (!form.ok) redirect("/events/submit?error=invalid");
  const description = z.string().max(4000).safeParse(String(formData.get("description") ?? ""));
  if (!description.success) redirect("/events/submit?error=invalid");

  const requestHeaders = await headers();
  const ip = forwardedIp(requestHeaders.get("cf-connecting-ip") ?? requestHeaders.get("x-forwarded-for"));
  const token = formData.get("cf-turnstile-response");
  if (typeof token !== "string" || !token || !(await verifyTurnstile(secret, token, ip === "unknown" ? null : ip))) {
    redirect("/events/submit?error=challenge");
  }
  if (!rateLimit(`event-submit:${user.id}`, 5, DAY)) redirect("/events/submit?error=limited");

  const { error } = await supabase.rpc("submit_event", rpcArgs(form.data, description.data));
  if (error) {
    const reason = failure(error.code, error.message);
    if (reason === "failed") console.error("event submit failed", error.code);
    redirect(`/events/submit?error=${reason}`);
  }
  redirect("/account/events?submitted=1");
}

export async function resubmitEvent(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!z.uuid().safeParse(id).success) redirect("/account/events?error=not_found");
  const back = `/account/events/${id}`;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(loginPath(back));

  const form = parseEventForm(formData);
  if (!form.ok) redirect(`${back}?error=invalid`);
  const description = z.string().max(4000).safeParse(String(formData.get("description") ?? ""));
  if (!description.success) redirect(`${back}?error=invalid`);
  // Resubmitting creates no row, so the database cap does not see it; this one does.
  if (!rateLimit(`event-resubmit:${user.id}`, 5, DAY)) redirect(`${back}?error=limited`);

  const { error } = await supabase.rpc("resubmit_event", { p_id: id, ...rpcArgs(form.data, description.data) });
  if (error) {
    const reason = error.code === "42501" ? "not_found" : failure(error.code, error.message);
    if (reason === "failed") console.error("event resubmit failed", error.code);
    redirect(`${back}?error=${reason}`);
  }
  redirect("/account/events?resubmitted=1");
}
