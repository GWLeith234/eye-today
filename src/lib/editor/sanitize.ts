import "server-only";

import DOMPurify from "isomorphic-dompurify";

// Everything the editor extensions can produce, and nothing else.
const ALLOWED_TAGS = [
  "p", "br", "strong", "em", "u", "s", "code", "pre",
  "h2", "h3", "h4", "blockquote", "ul", "ol", "li", "hr",
  "a", "img", "figure", "div", "iframe",
];

const ALLOWED_ATTR = [
  "href", "target", "rel", "src", "alt", "title", "width", "height", "start",
  "class", "data-type", "data-embed", "data-url", "data-youtube-video",
  "allowfullscreen", "allow", "frameborder", "loading",
];

const IFRAME_SRC = [
  /^https:\/\/www\.youtube\.com\/embed\/[A-Za-z0-9_-]+(\?[A-Za-z0-9_=&%.-]*)?$/,
  /^https:\/\/www\.youtube-nocookie\.com\/embed\/[A-Za-z0-9_-]+(\?[A-Za-z0-9_=&%.-]*)?$/,
  /^https:\/\/platform\.twitter\.com\/embed\/Tweet\.html\?id=\d{1,20}$/,
  /^https:\/\/www\.instagram\.com\/(p|reel)\/[A-Za-z0-9_-]{1,40}\/embed\/?$/,
];

// Images must be https, or come from this project's own Storage (http on a local stack).
const STORAGE_PREFIX = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? `${process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "")}/storage/v1/`
  : null;

export function isAllowedImageSrc(src: string | null | undefined): boolean {
  if (typeof src !== "string") return false;
  return /^https:\/\//i.test(src) || (STORAGE_PREFIX !== null && src.startsWith(STORAGE_PREFIX));
}

export function isAllowedIframeSrc(src: string | null | undefined): boolean {
  return typeof src === "string" && IFRAME_SRC.some((pattern) => pattern.test(src));
}

DOMPurify.addHook("uponSanitizeElement", (node, data) => {
  if (data.tagName === "iframe" && !isAllowedIframeSrc((node as Element).getAttribute("src"))) {
    node.parentNode?.removeChild(node);
  }
});

DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  const element = node as Element;
  if (element.tagName === "IMG" && !isAllowedImageSrc(element.getAttribute("src"))) {
    element.removeAttribute("src");
  }
  if (element.tagName === "A") {
    if (!/^(https?:\/\/|mailto:)/i.test(element.getAttribute("href") ?? "")) element.removeAttribute("href");
    element.setAttribute("rel", "noopener noreferrer nofollow");
    element.setAttribute("target", "_blank");
  }
});

export function sanitizeArticleHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false,
    FORBID_TAGS: ["script", "style"],
    ADD_ATTR: [],
  });
}
