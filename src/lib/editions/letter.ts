import { sanitizeArticleHtml } from "@/lib/editor/sanitize";

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// The letter is typed as plain text; blank lines separate paragraphs. It is stored as sanitised HTML so
// the reader and the PDF treat it like a story body.
export function letterHtml(text: string): string {
  const paragraphs = text
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escape(p).replace(/\n/g, "<br>")}</p>`);
  return sanitizeArticleHtml(paragraphs.join(""));
}
