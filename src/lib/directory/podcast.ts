// Pure helpers for podcast listings: platform links and the RSS feed. No I/O.

export const PLATFORMS = ["apple", "spotify", "youtube", "amazon", "rss", "other"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABELS: Record<Platform, string> = {
  apple: "Apple Podcasts",
  spotify: "Spotify",
  youtube: "YouTube",
  amazon: "Amazon Music",
  rss: "RSS",
  other: "Website",
};

export type PlatformLink = { platform: Platform; url: string };

const HTTPS = /^https:\/\/[^\s<>"']+$/;

export function isPlatform(value: unknown): value is Platform {
  return typeof value === "string" && (PLATFORMS as readonly string[]).includes(value);
}

// Guesses the platform from the host so an editor can paste a URL per line without naming it.
export function platformFromUrl(url: string): Platform {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host.endsWith("apple.com")) return "apple";
    if (host.endsWith("spotify.com")) return "spotify";
    if (host.endsWith("youtube.com") || host === "youtu.be") return "youtube";
    if (host.endsWith("amazon.com") || host.endsWith("music.amazon.com")) return "amazon";
    if (/\/(rss|feed)(\.xml)?$/i.test(new URL(url).pathname)) return "rss";
  } catch {
    // fall through
  }
  return "other";
}

export function readPlatformLinks(value: unknown): PlatformLink[] {
  if (!Array.isArray(value)) return [];
  const out: PlatformLink[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as { platform?: unknown; url?: unknown };
    if (typeof row.url !== "string" || !HTTPS.test(row.url) || row.url.length > 500) continue;
    const platform = isPlatform(row.platform) ? row.platform : platformFromUrl(row.url);
    if (seen.has(platform)) continue;
    seen.add(platform);
    out.push({ platform, url: row.url });
    if (out.length >= 8) break;
  }
  return out;
}

// One per line: "spotify | https://…" or just "https://…" (platform guessed).
export function parsePlatformLines(raw: string): PlatformLink[] {
  const rows: { platform?: string; url: string }[] = [];
  for (const line of raw.split("\n")) {
    const parts = line.split("|").map((p) => p.trim());
    const url = parts[1] || parts[0] || "";
    if (!HTTPS.test(url)) continue;
    rows.push({ platform: parts[1] ? parts[0].toLowerCase() : undefined, url });
  }
  return readPlatformLinks(rows);
}

export function platformLines(value: unknown): string {
  return readPlatformLinks(value).map((l) => `${l.platform} | ${l.url}`).join("\n");
}

export type FeedEpisode = { title: string; url: string | null; publishedOn: string | null; summary: string };

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };
function decode(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (whole, code: string) => {
      const lower = code.toLowerCase();
      if (lower in ENTITIES) return ENTITIES[lower];
      if (lower.startsWith("#x")) return String.fromCodePoint(Number.parseInt(lower.slice(2), 16)) || whole;
      if (lower.startsWith("#")) return String.fromCodePoint(Number(lower.slice(1))) || whole;
      return whole;
    });
}
const strip = (html: string) => decode(html).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").replace(/\s+([.,;:!?])/g, "$1").trim();

function tag(block: string, name: string): string | null {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i").exec(block);
  return m ? m[1] : null;
}

// Reads the newest episodes out of an RSS 2.0 or Atom feed. Text only; enclosures are ignored.
export function parseFeedEpisodes(xml: string, limit = 5): FeedEpisode[] {
  const items = xml.match(/<item\b[\s\S]*?<\/item>|<entry\b[\s\S]*?<\/entry>/gi) ?? [];
  const out: FeedEpisode[] = [];
  for (const block of items) {
    const title = strip(tag(block, "title") ?? "");
    if (!title) continue;
    let url = strip(tag(block, "link") ?? "");
    if (!url) {
      const href = /<link\b[^>]*href="([^"]+)"/i.exec(block)?.[1];
      url = href ? decode(href) : "";
    }
    const dateText = tag(block, "pubDate") ?? tag(block, "published") ?? tag(block, "updated") ?? "";
    const date = dateText ? new Date(strip(dateText)) : null;
    const summary = strip(tag(block, "description") ?? tag(block, "summary") ?? tag(block, "itunes:summary") ?? "").slice(0, 280);
    out.push({
      title: title.slice(0, 200),
      url: HTTPS.test(url) ? url : null,
      publishedOn: date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : null,
      summary,
    });
    if (out.length >= limit) break;
  }
  return out;
}
