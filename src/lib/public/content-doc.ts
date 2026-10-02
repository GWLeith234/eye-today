import createDOMPurify from "dompurify";
import { JSDOM } from "jsdom";

// Legal pages are not articles. They get their own allowlist, with no iframes, images or
// styles, and a fresh DOMPurify window so the article sanitizer's hooks never run here.

const ALLOWED_TAGS = ["p", "h2", "h3", "h4", "ul", "ol", "li", "a", "strong", "em", "code", "br", "hr", "blockquote"];
const ALLOWED_ATTR = ["href", "rel", "target"];

export type ContentDoc = {
  status: string | null;
  updated: string | null;
  html: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function isSafeContentHref(href: string): boolean {
  if (/^https:\/\/[^\s]+$/i.test(href)) return true;
  if (/^mailto:[^\s]+$/i.test(href)) return true;
  return /^\/(?!\/)[^\s]*$/.test(href) && !href.includes("\\");
}

function formatText(raw: string): string {
  let text = escapeHtml(raw);
  text = text.replace(/`([^`]+)`/g, "<code>$1</code>");
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
  return text;
}

function inline(raw: string): string {
  const pattern = /\[([^\]]+)\]\(([^)\s]+)\)/g;
  const parts: string[] = [];
  let last = 0;
  for (const match of raw.matchAll(pattern)) {
    const index = match.index ?? 0;
    parts.push(formatText(raw.slice(last, index)));
    const href = match[2];
    const label = formatText(match[1]);
    parts.push(isSafeContentHref(href) ? `<a href="${escapeHtml(href)}">${label}</a>` : label);
    last = index + match[0].length;
  }
  parts.push(formatText(raw.slice(last)));
  return parts.join("");
}

let purifier: ReturnType<typeof createDOMPurify> | null = null;

function legalPurifier() {
  if (!purifier) {
    purifier = createDOMPurify(new JSDOM("").window);
    purifier.addHook("afterSanitizeAttributes", (node) => {
      const element = node as Element;
      if (element.tagName !== "A") return;
      const href = element.getAttribute("href") ?? "";
      if (!isSafeContentHref(href)) {
        element.removeAttribute("href");
        return;
      }
      element.setAttribute("rel", "noopener noreferrer");
      if (/^https:\/\//i.test(href)) element.setAttribute("target", "_blank");
    });
  }
  return purifier;
}

export function sanitizeLegalHtml(html: string): string {
  return legalPurifier().sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false,
  });
}

function markdownToHtml(source: string): string {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: string[] = [];
  const paragraph: string[] = [];
  let index = 0;

  const flushParagraph = () => {
    const text = paragraph.join(" ").trim();
    paragraph.length = 0;
    if (text) blocks.push(`<p>${inline(text)}</p>`);
  };

  while (index < lines.length) {
    const trimmed = lines[index].trim();
    if (!trimmed) {
      flushParagraph();
      index += 1;
      continue;
    }

    const heading = /^(#{1,4})\s+(.+)$/.exec(trimmed);
    if (heading) {
      flushParagraph();
      const level = heading[1].length;
      if (level > 1) blocks.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }

    if (trimmed === "---" || trimmed === "***") {
      flushParagraph();
      blocks.push("<hr>");
      index += 1;
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      flushParagraph();
      const items: string[] = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) {
        items.push(`<li>${inline(lines[index].trim().replace(/^[-*]\s+/, ""))}</li>`);
        index += 1;
      }
      blocks.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      flushParagraph();
      const items: string[] = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
        items.push(`<li>${inline(lines[index].trim().replace(/^\d+\.\s+/, ""))}</li>`);
        index += 1;
      }
      blocks.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    if (trimmed.startsWith(">")) {
      flushParagraph();
      const quote: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith(">")) {
        quote.push(lines[index].trim().replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push(`<blockquote><p>${inline(quote.join(" "))}</p></blockquote>`);
      continue;
    }

    paragraph.push(trimmed);
    index += 1;
  }
  flushParagraph();
  return sanitizeLegalHtml(blocks.join(""));
}

// Front matter is metadata for reviewers. It is never copied into the HTML.
export function renderContentMarkdown(raw: string): ContentDoc {
  let body = raw.replace(/^\uFEFF/, "");
  let status: string | null = null;
  let updated: string | null = null;
  if (body.startsWith("---\n")) {
    const end = body.indexOf("\n---\n", 4);
    if (end !== -1) {
      const matter = body.slice(4, end);
      body = body.slice(end + 5);
      for (const line of matter.split("\n")) {
        const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line.trim());
        if (!match) continue;
        if (match[1] === "status") status = match[2].trim();
        if (match[1] === "updated") updated = match[2].trim();
      }
    }
  }
  return { status, updated, html: markdownToHtml(body) };
}
