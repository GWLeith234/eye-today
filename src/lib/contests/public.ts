import "server-only";

import { createAnonClient } from "@/lib/supabase/anon";

export type ContestCard = { slug: string; title: string; prize: string; state: "open" | "closed" | "upcoming"; closes_at: string };
export type ContestDetail = {
  id: string;
  slug: string;
  title: string;
  description: string;
  prize: string;
  rules: string;
  eligibility: string;
  question: string | null;
  state: "open" | "closed" | "upcoming";
  opens_at: string | null;
  closes_at: string;
  winner_first_name: string | null;
  drawn_at: string | null;
  updated_at: string;
};

export async function listContests(): Promise<ContestCard[]> {
  const anon = createAnonClient();
  if (!anon) return [];
  const { data, error } = await anon.rpc("contests_public");
  if (error) console.error("public read contests_public failed", error.code);
  return (data as ContestCard[] | null) ?? [];
}

export async function getContest(slug: string): Promise<ContestDetail | null> {
  const anon = createAnonClient();
  if (!anon) return null;
  const { data, error } = await anon.rpc("contest_by_slug", { p_slug: slug });
  if (error) console.error("public read contest_by_slug failed", error.code);
  return ((data as ContestDetail[] | null) ?? [])[0] ?? null;
}

export const when = (iso: string) => new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeStyle: "short", timeZone: "UTC" }).format(new Date(iso)) + " UTC";
