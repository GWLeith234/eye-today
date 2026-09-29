// Plain text of a saved article, for the assistant. Pure: no server-only import, so tests can load it.

export const MAX_BODY_CHARS = 12000;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " " };

// Angle brackets are removed at the end, so the text can never carry markup and a
// model quote never contains "<" or ">".
export function htmlToPlainText(html: string | null | undefined): string {
  return (html ?? "")
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<\/(p|h[1-6]|li|blockquote|figure|div|pre)\s*>|<br\s*\/?>/gi, "\n\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_m, name: string) => ENTITIES[name])
    .replace(/[<>]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function cleanLine(text: string | null | undefined): string {
  return (text ?? "").replace(/[<>]/g, " ").replace(/\s+/g, " ").trim();
}

export function cutBody(text: string): string {
  return text.length > MAX_BODY_CHARS ? text.slice(0, MAX_BODY_CHARS) : text;
}
