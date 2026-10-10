import "server-only";

import { createAnonClient } from "@/lib/supabase/anon";

import type { PostingFilters } from "./query";
import type { JobSummary, PostingCard, PostingDetail, PostingKind } from "./types";

function within<T>(work: Promise<T>, fallback: T): Promise<T> {
  const settled = work.catch(() => fallback);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), 4000);
    void settled.then((value) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
}

async function rpc<T>(name: string, args: Record<string, unknown>, fallback: T): Promise<T> {
  const supabase = createAnonClient();
  if (!supabase) return fallback;
  const { data, error } = await supabase.rpc(name, args);
  if (error) {
    console.error(`public read ${name} failed`, error.code);
    return fallback;
  }
  return (data as T) ?? fallback;
}

export function listPostings(kind: PostingKind, filters: PostingFilters): Promise<PostingCard[]> {
  return within(
    rpc<PostingCard[]>(
      "postings_list",
      { p_kind: kind, p_type: filters.type || null, p_country: filters.country || null, p_remote: filters.remote || null, p_page: filters.page },
      [],
    ),
    [],
  );
}

export function countPostings(kind: PostingKind, filters: PostingFilters): Promise<number> {
  return within(
    rpc<number>("postings_count", { p_kind: kind, p_type: filters.type || null, p_country: filters.country || null, p_remote: filters.remote || null }, 0),
    0,
  );
}

export async function getPosting(kind: PostingKind, slug: string): Promise<PostingDetail | null> {
  const rows = await within(rpc<PostingDetail[]>("posting_by_slug", { p_kind: kind, p_slug: slug }, []), []);
  return rows[0] ?? null;
}

export function latestJobs(limit = 4): Promise<JobSummary[]> {
  return within(rpc<JobSummary[]>("latest_jobs", { lim: limit }, []), []);
}

export function jobsForListing(listingId: string, limit = 4): Promise<JobSummary[]> {
  return within(rpc<JobSummary[]>("jobs_for_listing", { p_listing: listingId, lim: limit }, []), []);
}

export function postingsSitemap(): Promise<{ kind: PostingKind; slug: string; updated_at: string }[]> {
  return within(rpc<{ kind: PostingKind; slug: string; updated_at: string }[]>("postings_sitemap", {}, []), []);
}
