"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { getSession } from "@/lib/auth/session";
import { forwardedIp, rateLimit } from "@/lib/http/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAnonClient } from "@/lib/supabase/anon";

import { ensureDeviceHash, readDeviceHash } from "./device";
import { buildPollView, type PollView, type VoteOutcome } from "./types";

const id = z.uuid();

async function voter(): Promise<{ profile: string | null; device: string | null }> {
  const { user } = await getSession();
  if (user) return { profile: user.id, device: null };
  return { profile: null, device: await readDeviceHash() };
}

async function view(pollId: string, who: { profile: string | null; device: string | null }): Promise<PollView | null> {
  const anon = createAnonClient();
  if (!anon) return null;
  const { data: rows, error } = await anon.rpc("poll_public", { p_id: pollId });
  if (error || !rows?.length) return null;
  let mine: { option_id: string; votes: number; total: number; my_option: string | null }[] = [];
  if (who.profile || who.device) {
    try {
      const { data } = await createAdminClient().rpc("poll_results_for", { p_id: pollId, p_profile: who.profile, p_device: who.device });
      mine = data ?? [];
    } catch {
      // Without the service role the reader sees the public view only.
    }
  }
  return buildPollView(rows, mine);
}

// The poll as this reader may see it. Called by the widget when it mounts.
export async function loadPoll(pollId: string): Promise<PollView | null> {
  if (!id.safeParse(pollId).success) return null;
  return view(pollId, await voter());
}

export async function votePoll(pollId: string, optionId: string): Promise<VoteOutcome> {
  if (!id.safeParse(pollId).success || !id.safeParse(optionId).success) return { ok: false, error: "invalid" };

  const requestHeaders = await headers();
  const ip = forwardedIp(requestHeaders.get("cf-connecting-ip") ?? requestHeaders.get("x-forwarded-for"));
  if (!rateLimit(`poll-vote:${ip}`, 30, 10 * 60 * 1000)) return { ok: false, error: "limited" };

  const { user } = await getSession();
  const who = user ? { profile: user.id, device: null } : { profile: null, device: await ensureDeviceHash() };
  if (!rateLimit(`poll-vote:${who.profile ?? who.device}`, 10, 10 * 60 * 1000)) return { ok: false, error: "limited" };

  let result: string | null = null;
  try {
    const { data, error } = await createAdminClient().rpc("cast_poll_vote", {
      p_poll: pollId,
      p_option: optionId,
      p_profile: who.profile,
      p_device: who.device,
    });
    if (error) throw error;
    result = typeof data === "string" ? data : null;
  } catch (error) {
    console.error("poll vote failed", (error as { code?: string })?.code ?? "unknown");
    return { ok: false, error: "unavailable" };
  }

  const poll = await view(pollId, who);
  if (result === "ok" && poll) return { ok: true, poll };
  if (result === "already_voted" || result === "closed") return { ok: false, error: result, poll: poll ?? undefined };
  return { ok: false, error: "invalid", poll: poll ?? undefined };
}
