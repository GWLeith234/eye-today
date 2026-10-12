import "server-only";

import { createAnonClient } from "@/lib/supabase/anon";

import { isTrackerKind, type TrackerEntry, type TrackerKind } from "./model";

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

async function load(kind: TrackerKind | null): Promise<TrackerEntry[]> {
  const supabase = createAnonClient();
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("tracker_public", { p_kind: kind });
  if (error) {
    console.error("public read tracker_public failed", error.code);
    return [];
  }
  return ((data as TrackerEntry[] | null) ?? []).filter((row) => isTrackerKind(row.kind));
}

export function trackerEntries(kind: TrackerKind | null = null): Promise<TrackerEntry[]> {
  return within(load(kind), []);
}
