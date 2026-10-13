import "server-only";

import { lookup } from "node:dns/promises";

import { isPrivateHost, isPrivateIp } from "@/lib/newsroom/model";

import { type FeedEpisode, parseFeedEpisodes } from "./podcast";

// Latest episodes for a podcast listing, read from its RSS feed at request time and cached for an hour.
// Same guard rails as the news-feed link preview: https only, no private hosts by name or by address, redirects
// by hand, 8 s, 512 KB.

const MAX_HOPS = 3;
const MAX_BYTES = 524_288;
const TTL = 3_600_000;
const cache = new Map<string, { at: number; episodes: FeedEpisode[] }>();

async function resolvesPrivately(hostname: string): Promise<boolean> {
  if (isPrivateHost(hostname)) return true;
  try {
    const addresses = await lookup(hostname, { all: true });
    return addresses.length === 0 || addresses.some((a) => isPrivateIp(a.address));
  } catch {
    return true;
  }
}

export async function latestEpisodes(feedUrl: string | null | undefined, limit = 5): Promise<FeedEpisode[]> {
  if (!feedUrl || !/^https:\/\/[^\s<>"']+$/.test(feedUrl)) return [];
  const hit = cache.get(feedUrl);
  if (hit && Date.now() - hit.at < TTL) return hit.episodes.slice(0, limit);
  const episodes = await within(fetchEpisodes(feedUrl, limit), []);
  cache.set(feedUrl, { at: Date.now(), episodes });
  if (cache.size > 200) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return episodes;
}

function within<T>(work: Promise<T>, fallback: T): Promise<T> {
  const settled = work.catch(() => fallback);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), 9000);
    void settled.then((value) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
}

async function fetchEpisodes(start: string, limit: number): Promise<FeedEpisode[]> {
  const origin = process.env.SITE_URL?.trim().replace(/\/+$/, "") || "https://theeye.today";
  const headers = { "User-Agent": `EyeTodayDirectory/1.0 (+${origin})`, Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" };
  let url = start;
  let response: Response | null = null;
  for (let hop = 0; hop <= MAX_HOPS; hop += 1) {
    if (await resolvesPrivately(new URL(url).hostname)) return [];
    response = await fetch(url, { headers, redirect: "manual", signal: AbortSignal.timeout(8000) });
    if (response.status < 300 || response.status >= 400) break;
    const next = new URL(response.headers.get("location") ?? "", url).toString();
    await response.body?.cancel().catch(() => undefined);
    if (!/^https:\/\//.test(next) || hop === MAX_HOPS) return [];
    url = next;
    response = null;
  }
  if (!response || !response.ok) return [];
  const reader = response.body?.getReader();
  if (!reader) return [];
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    size += value.byteLength;
  }
  await reader.cancel().catch(() => undefined);
  const xml = new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks.map((c) => Buffer.from(c))));
  return parseFeedEpisodes(xml, limit);
}
