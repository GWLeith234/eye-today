// Pure helpers for the Trials & Funding Tracker. No I/O, no React.

export const TRACKER_KINDS = ["trial", "funding", "regulatory"] as const;
export type TrackerKind = (typeof TRACKER_KINDS)[number];

export const TRACKER_KIND_LABELS: Record<TrackerKind, string> = { trial: "Trials", funding: "Funding", regulatory: "Regulatory" };
export const TRACKER_KIND_SINGULAR: Record<TrackerKind, string> = { trial: "Trial", funding: "Funding", regulatory: "Regulatory" };

export function isTrackerKind(value: unknown): value is TrackerKind {
  return typeof value === "string" && (TRACKER_KINDS as readonly string[]).includes(value);
}

export type KeyDate = { label: string; date: string };
export type TrackerLink = { title: string; url: string };

export type TrackerEntry = {
  id: string;
  slug: string;
  kind: TrackerKind;
  title: string;
  sponsor: string;
  stage: string;
  amount: string;
  jurisdiction: string;
  key_dates: unknown;
  links: unknown;
  notes: string;
  last_reviewed: string | null;
  updated_at: string;
  article_slug: string | null;
  article_section: string | null;
  article_title: string | null;
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function readKeyDates(value: unknown): KeyDate[] {
  if (!Array.isArray(value)) return [];
  const out: KeyDate[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as { label?: unknown; date?: unknown };
    if (typeof row.date !== "string" || !DAY.test(row.date)) continue;
    const label = typeof row.label === "string" ? row.label.replace(/[<>]/g, "").trim().slice(0, 80) : "";
    out.push({ label: label || "Date", date: row.date });
    if (out.length >= 12) break;
  }
  return out;
}

// One per line: "Comments close | 2026-11-20".
export function parseKeyDateLines(raw: string): KeyDate[] {
  const out: KeyDate[] = [];
  for (const line of raw.split("\n")) {
    const parts = line.split("|").map((part) => part.trim());
    const date = parts[1] || parts[0] || "";
    if (!DAY.test(date)) continue;
    const label = (parts[1] ? parts[0] : "Date").replace(/[<>]/g, "").slice(0, 80) || "Date";
    out.push({ label, date });
    if (out.length >= 12) break;
  }
  return out;
}

export function keyDateLines(value: unknown): string {
  return readKeyDates(value).map((d) => `${d.label} | ${d.date}`).join("\n");
}

export function trackerSlug(title: string): string {
  return title.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

// The next date that has not passed, else the most recent one.
export function nextKeyDate(dates: KeyDate[], today: string): KeyDate | null {
  const upcoming = dates.filter((d) => d.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  if (upcoming[0]) return upcoming[0];
  return [...dates].sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
}
