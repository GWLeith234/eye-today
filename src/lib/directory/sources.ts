export type SourceLink = { title: string; url: string };

function httpsUrl(value: string): string | null {
  const url = value.trim();
  return /^https:\/\/\S+$/.test(url) ? url.slice(0, 300) : null;
}

export function readSources(value: unknown): SourceLink[] {
  if (!Array.isArray(value)) return [];
  const links: SourceLink[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as { title?: unknown; url?: unknown };
    if (typeof row.url !== "string") continue;
    const url = httpsUrl(row.url);
    if (!url) continue;
    const title = typeof row.title === "string" && row.title.trim() ? row.title.trim().slice(0, 160) : url;
    links.push({ title, url });
    if (links.length >= 20) break;
  }
  return links;
}

export function parseSourceLines(raw: string): SourceLink[] {
  const links: SourceLink[] = [];
  for (const line of raw.split("\n")) {
    const parts = line.split("|").map((part) => part.trim());
    const url = httpsUrl(parts[1] || parts[0] || "");
    if (!url) continue;
    const title = (parts[1] ? parts[0] : url).slice(0, 160) || url;
    links.push({ title, url });
    if (links.length >= 20) break;
  }
  return links;
}

export function sourceLines(value: unknown): string {
  return readSources(value).map((source) => `${source.title} | ${source.url}`).join("\n");
}
