// X / Instagram embed URLs. Only these hosts are accepted; anything else is
// rejected before it reaches the document, and again when rendering.

export type EmbedProvider = "x" | "instagram";

export type ParsedEmbed = {
  provider: EmbedProvider;
  url: string;
  src: string;
};

const X_HOSTS = new Set(["x.com", "www.x.com", "twitter.com", "www.twitter.com", "mobile.twitter.com"]);
const INSTAGRAM_HOSTS = new Set(["instagram.com", "www.instagram.com"]);

export function parseEmbedUrl(input: unknown): ParsedEmbed | null {
  if (typeof input !== "string" || input.length > 500) return null;
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase();

  if (X_HOSTS.has(host)) {
    const match = url.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/status\/(\d{1,20})\/?$/);
    if (!match) return null;
    return {
      provider: "x",
      url: `https://x.com/${match[1]}/status/${match[2]}`,
      src: `https://platform.twitter.com/embed/Tweet.html?id=${match[2]}`,
    };
  }

  if (INSTAGRAM_HOSTS.has(host)) {
    const match = url.pathname.match(/^\/(p|reel)\/([A-Za-z0-9_-]{1,40})\/?$/);
    if (!match) return null;
    return {
      provider: "instagram",
      url: `https://www.instagram.com/${match[1]}/${match[2]}/`,
      src: `https://www.instagram.com/${match[1]}/${match[2]}/embed`,
    };
  }

  return null;
}
