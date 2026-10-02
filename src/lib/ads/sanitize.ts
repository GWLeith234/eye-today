import "server-only";

import DOMPurify from "isomorphic-dompurify";

// Ad HTML allows p, br, strong, em, a and img, and nothing else. The result is rebuilt tag by
// tag after DOMPurify, so it does not depend on which hooks other code has registered on the
// shared DOMPurify instance: every kept link is https with rel="sponsored noopener noreferrer"
// and target="_blank", and every kept image is https (or this project's Storage).

const STORAGE_PREFIX = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? `${process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "")}/storage/v1/`
  : null;

const isHttps = (value: string) => /^https:\/\/[^\s"'<>]+$/i.test(value);
const isImageSrc = (value: string) => isHttps(value) || (STORAGE_PREFIX !== null && value.startsWith(STORAGE_PREFIX));

// DOMPurify serialises attributes as name="value" with the value escaped, so this is exact.
const attribute = (tag: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`, "i").exec(tag)?.[1] ?? null;

export const AD_REL = "sponsored noopener noreferrer";

export type SanitizedAd = { html: string; usable: boolean };

export function sanitizeAdHtml(input: string | null | undefined): SanitizedAd {
  const clean = DOMPurify.sanitize(input ?? "", {
    ALLOWED_TAGS: ["p", "br", "strong", "em", "a", "img"],
    ALLOWED_ATTR: ["href", "src", "alt"],
    ALLOW_DATA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false,
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "svg", "math"],
  });

  let linkOpen = false;
  const html = clean.replace(/<a\b[^>]*>|<\/a>|<img\b[^>]*>/gi, (tag) => {
    if (/^<\/a>$/i.test(tag)) {
      const out = linkOpen ? "</a>" : "";
      linkOpen = false;
      return out;
    }
    if (/^<a\b/i.test(tag)) {
      const href = attribute(tag, "href");
      linkOpen = href !== null && isHttps(href);
      return linkOpen ? `<a href="${href}" rel="${AD_REL}" target="_blank">` : "";
    }
    const src = attribute(tag, "src");
    if (src === null || !isImageSrc(src)) return "";
    return `<img src="${src}" alt="${attribute(tag, "alt") ?? ""}">`;
  });

  const text = html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
  return { html, usable: text.length > 0 || /<img\b/i.test(html) };
}

// Point every link at one URL (the click route), so a creative can only ever lead where its
// stored click_url says. Works on this file's own output, where every link is `<a href="…"`.
export function pointLinksAt(html: string, url: string): string {
  const escaped = url.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  return html.replace(/<a href="[^"]*"/g, `<a href="${escaped}"`);
}
