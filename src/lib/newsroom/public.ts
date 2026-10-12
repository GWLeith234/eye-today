import "server-only";

import { createAnonClient } from "@/lib/supabase/anon";

import type { NewsLink } from "./model";

export const FEED_PAGE_SIZE = 20;

// A hung database must not hold the page open (same rule as the directory and events reads).
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

export function newsFeed(page = 1, limit = FEED_PAGE_SIZE): Promise<NewsLink[]> {
  return within(rpc<NewsLink[]>("news_links_public", { p_page: page, lim: limit }, []), []);
}

export function newsFeedCount(): Promise<number> {
  return within(rpc<number>("news_links_count", {}, 0), 0);
}
