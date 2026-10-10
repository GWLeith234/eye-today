"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { requireArea } from "@/lib/auth/session";
import { rateLimit } from "@/lib/http/rate-limit";
import { getStripe } from "@/lib/membership/stripe";
import { runPostingCheckout } from "@/lib/postings/checkout";
import { parsePostingForm, saveArgs, saveFailure } from "@/lib/postings/form";
import { refreshPostings } from "@/lib/postings/revalidate";
import type { PostingKind } from "@/lib/postings/types";

const kindOf = (value: FormDataEntryValue | null): PostingKind => (value === "classified" ? "classified" : "job");

export async function savePosting(formData: FormData) {
  const { supabase, user } = await requireArea("account");
  const kind = kindOf(formData.get("kind"));
  const idRaw = String(formData.get("id") ?? "");
  const id = z.uuid().safeParse(idRaw).success ? idRaw : null;
  const back = id ? `/account/postings/${id}` : `/account/postings/new?kind=${kind}`;
  if (!rateLimit(`posting-save:${user.id}`, 30, 60 * 60 * 1000)) redirect(`${back}${back.includes("?") ? "&" : "?"}error=limited`);

  const form = parsePostingForm(kind, formData);
  if (!form.ok) redirect(`${back}${back.includes("?") ? "&" : "?"}error=invalid&detail=${encodeURIComponent(form.error)}`);

  // Edits to a live posting take it down until an editor approves it again.
  let previous: { slug: string; status: string } | null = null;
  if (id) {
    const { data } = await supabase.from("postings").select("slug, status").eq("id", id).maybeSingle<{ slug: string; status: string }>();
    previous = data;
  }

  const { data, error } = await supabase.rpc("save_posting", saveArgs(id, form.data));
  if (error || typeof data !== "string") {
    const reason = error ? saveFailure(error) : "failed";
    if (reason === "failed") console.error("posting save failed", error?.code);
    redirect(`${back}${back.includes("?") ? "&" : "?"}error=${reason}`);
  }
  if (previous?.status === "published") refreshPostings({ kind, slug: previous.slug });
  redirect(`/account/postings?saved=1`);
}

export async function startPostingCheckout(formData: FormData) {
  const { supabase, user } = await requireArea("account");
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) redirect("/account/postings");
  if (!rateLimit(`posting-checkout:${user.id}`, 10, 10 * 60 * 1000)) redirect("/account/postings?error=failed");

  const stripe = getStripe();
  const outcome = stripe
    ? await runPostingCheckout(
        {
          env: process.env,
          userId: user.id,
          email: user.email ?? null,
          postingId: id.data,
          loadPosting: async () => {
            const { data } = await supabase
              .from("postings")
              .select("status, expires_at")
              .eq("id", id.data)
              .eq("poster_id", user.id)
              .maybeSingle<{ status: string; expires_at: string | null }>();
            return data;
          },
          createSession: async (params) => (await stripe.checkout.sessions.create(params)).url,
        },
        String(formData.get("days") ?? ""),
      )
    : ({ ok: false, error: "not_configured" } as const);

  if (!outcome.ok) redirect(`/account/postings?error=${outcome.error}`);
  redirect(outcome.url);
}
