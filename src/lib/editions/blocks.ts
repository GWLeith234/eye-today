// Turns a story's sanitised body_html into plain blocks the PDF can lay out. Only text structure
// survives: headings, paragraphs, quotes and list items. Images, embeds, polls, iframes, tables and
// anything else are dropped, since a PDF page cannot run them. No DOM: this runs anywhere.

export type Block =
  | { kind: "heading"; level: 2 | 3; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "quote"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] };

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", mdash: "—", ndash: "–",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", copy: "©", reg: "®", trade: "™", deg: "°", eacute: "é", egrave: "è",
};

export function decodeEntities(input: string): string {
  return input.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body: string) => {
    if (body[0] === "#") {
      const code = body[1].toLowerCase() === "x" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[body.toLowerCase()] ?? match;
  });
}

// Inline tags become their text; <br> becomes a space; whitespace collapses.
export function inlineText(html: string): string {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

// Blocks that must never produce text, even their children.
const DROP = /<(script|style|iframe|svg|figure|table|video|audio|object|embed|form|noscript)\b[\s\S]*?<\/\1>/gi;

const BLOCK = /<(h[1-6]|p|blockquote|ul|ol)\b[^>]*>([\s\S]*?)<\/\1>/gi;
const ITEM = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;

export function htmlToBlocks(html: string): Block[] {
  const blocks: Block[] = [];
  const source = (html ?? "").replace(DROP, "");
  for (const match of source.matchAll(BLOCK)) {
    const tag = match[1].toLowerCase();
    const inner = match[2];
    if (tag === "ul" || tag === "ol") {
      const items = [...inner.matchAll(ITEM)].map((m) => inlineText(m[1])).filter(Boolean);
      if (items.length) blocks.push({ kind: "list", ordered: tag === "ol", items });
      continue;
    }
    if (tag === "blockquote") {
      // A quote usually wraps its own <p>; keep the text in one block.
      const text = inner
        .split(/<\/p>/i)
        .map(inlineText)
        .filter(Boolean)
        .join("\n");
      if (text) blocks.push({ kind: "quote", text });
      continue;
    }
    const text = inlineText(inner);
    if (!text) continue;
    if (tag[0] === "h") blocks.push({ kind: "heading", level: tag === "h2" || tag === "h1" ? 2 : 3, text });
    else blocks.push({ kind: "paragraph", text });
  }
  return blocks;
}

// Short plain-text summary for contents pages and the newsletter card.
export function excerpt(blocks: Block[], maxChars = 160): string {
  const first = blocks.find((b) => b.kind === "paragraph");
  if (!first || first.kind !== "paragraph") return "";
  if (first.text.length <= maxChars) return first.text;
  const cut = first.text.slice(0, maxChars);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 40))}…`;
}

export function wordCount(blocks: Block[]): number {
  let n = 0;
  for (const b of blocks) {
    const text = b.kind === "list" ? b.items.join(" ") : b.text;
    n += text.split(/\s+/).filter(Boolean).length;
  }
  return n;
}
