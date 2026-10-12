// Pure helpers for the curated news feed. No I/O, no React.

export const BLURB_MAX = 280;
export const MAX_TAGS = 10;

export type NewsLink = {
  id: string;
  url: string;
  title: string;
  source_name: string;
  published_on: string; // yyyy-mm-dd
  blurb: string;
  tags: string[];
};

// https only, no credentials, no whitespace or angle brackets; the DB check says the same.
export function cleanLinkUrl(value: string): string | null {
  const text = value.trim();
  if (text.length > 2000 || /[\s<>"']/.test(text)) return null;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  url.hash = "";
  return url.toString();
}

// Hosts a link-preview fetch must never reach: loopback, private and shared ranges, link-local, metadata,
// and their IPv6 forms (including IPv4-mapped and NAT64 addresses). Pure, so it also runs in the browser bundle.
export function isPrivateIpv4(ip: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if ([a, b, Number(m[3]), Number(m[4])].some((n) => n > 255)) return true;
  return a === 10 || a === 127 || a === 0 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

// Expands "::ffff:7f00:1" / "::ffff:127.0.0.1" / "64:ff9b::7f00:1" to the IPv4 they carry, else null.
function mappedIpv4(ip: string): string | null {
  const lower = ip.toLowerCase();
  const m = /^(?:::ffff:|64:ff9b::)(?:([0-9a-f]{1,4}):([0-9a-f]{1,4})|(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}))$/.exec(lower);
  if (!m) return null;
  if (m[3]) return m[3];
  const hi = Number.parseInt(m[1], 16);
  const lo = Number.parseInt(m[2], 16);
  return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
}

export function isPrivateIp(ip: string): boolean {
  const bare = ip.replace(/^\[|\]$/g, "").toLowerCase().split("%")[0];
  if (isPrivateIpv4(bare)) return true;
  if (bare.includes(":")) {
    if (bare === "::" || bare === "::1") return true;
    const mapped = mappedIpv4(bare);
    if (mapped) return isPrivateIpv4(mapped);
    return /^(fc|fd|fe[89ab])/.test(bare) || bare.startsWith("::ffff:") || bare.startsWith("64:ff9b:");
  }
  return false;
}

export function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".home.arpa")) return true;
  return isPrivateIp(host);
}

// "www.theguardian.com" -> "theguardian.com"; the editor can rename it.
export function sourceFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return host.slice(0, 120);
  } catch {
    return "";
  }
}

export function cleanTitle(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").replace(/[<>]/g, "").trim().slice(0, 200);
}

export function cleanBlurb(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").replace(/[<>]/g, "").trim().slice(0, BLURB_MAX);
}

// Comma or newline separated, lowercase, letters digits and hyphens.
export function parseTags(value: string): string[] {
  const seen = new Set<string>();
  for (const raw of value.split(/[,\n]/)) {
    const tag = raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
    if (tag) seen.add(tag);
    if (seen.size >= MAX_TAGS) break;
  }
  return [...seen];
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

export function decodeEntities(text: string): string {
  return text.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (whole, code: string) => {
    const lower = code.toLowerCase();
    if (lower in ENTITIES) return ENTITIES[lower];
    if (lower.startsWith("#x")) return String.fromCodePoint(Number.parseInt(lower.slice(2), 16)) || whole;
    if (lower.startsWith("#")) return String.fromCodePoint(Number(lower.slice(1))) || whole;
    return whole;
  });
}

export type LinkPreview = { title: string; source: string; publishedOn: string | null; description: string };

function meta(html: string, keys: string[]): string | null {
  for (const key of keys) {
    const patterns = [
      new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']`, "i"),
      new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`, "i"),
    ];
    for (const pattern of patterns) {
      const found = pattern.exec(html);
      if (found?.[1]?.trim()) return decodeEntities(found[1]);
    }
  }
  return null;
}

// Reads the page's own headline, outlet name and date from its <head>. Text only: images are never fetched.
export function parseLinkPreview(html: string, url: string): LinkPreview {
  const head = html.slice(0, 200_000);
  const title = meta(head, ["og:title", "twitter:title"]) ?? decodeEntities(/<title[^>]*>([^<]*)<\/title>/i.exec(head)?.[1] ?? "");
  const source = meta(head, ["og:site_name", "application-name"]) ?? sourceFromUrl(url);
  const published = meta(head, ["article:published_time", "og:article:published_time", "datePublished", "date", "pubdate", "publish_date"]);
  const description = meta(head, ["og:description", "description", "twitter:description"]) ?? "";
  return {
    title: cleanTitle(title),
    source: cleanTitle(source).slice(0, 120),
    publishedOn: published ? isoDate(published) : null,
    description: cleanBlurb(description),
  };
}

export function isoDate(value: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!m) return null;
  const date = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : `${m[1]}-${m[2]}-${m[3]}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "2026-10-09" -> "9 Oct 2026"
export function dateLabel(isoDay: string): string {
  const [y, m, d] = isoDay.split("-").map(Number);
  if (!y || !m || !d) return isoDay;
  return `${d} ${MONTHS[m - 1] ?? ""} ${y}`;
}
