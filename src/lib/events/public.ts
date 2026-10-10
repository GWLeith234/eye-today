import "server-only";

import { createAnonClient } from "@/lib/supabase/anon";

import type { EventFilters } from "./query";
import type { EventCard, EventDetail, EventSummary, FeedEvent } from "./types";

// A hung database must not hold the page open (same rule as the directory reads).
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

export function listEvents(filters: EventFilters): Promise<EventCard[]> {
  return within(
    rpc<EventCard[]>(
      "events_list",
      { p_type: filters.type || null, p_country: filters.country || null, p_online: filters.online, p_when: filters.when, p_page: filters.page },
      [],
    ),
    [],
  );
}

export function countEvents(filters: EventFilters): Promise<number> {
  return within(
    rpc<number>(
      "events_list_count",
      { p_type: filters.type || null, p_country: filters.country || null, p_online: filters.online, p_when: filters.when },
      0,
    ),
    0,
  );
}

export function eventsInMonth(year: number, month: number): Promise<EventSummary[]> {
  const first = `${year}-${String(month).padStart(2, "0")}-01`;
  return within(rpc<EventSummary[]>("events_in_month", { p_month: first }, []), []);
}

export async function getEvent(slug: string): Promise<EventDetail | null> {
  const rows = await within(rpc<EventDetail[]>("event_by_slug", { p_slug: slug }, []), []);
  return rows[0] ?? null;
}

export function upcomingEvents(limit = 4): Promise<EventSummary[]> {
  return within(rpc<EventSummary[]>("upcoming_events", { lim: limit }, []), []);
}

export function eventsForListing(listingId: string, limit = 4): Promise<EventSummary[]> {
  return within(rpc<EventSummary[]>("events_for_listing", { p_listing: listingId, lim: limit }, []), []);
}

export function feedEvents(): Promise<FeedEvent[]> {
  return within(rpc<FeedEvent[]>("events_for_feed", {}, []), []);
}

export function eventsSitemap(): Promise<{ slug: string; updated_at: string }[]> {
  return within(rpc<{ slug: string; updated_at: string }[]>("events_sitemap", {}, []), []);
}
