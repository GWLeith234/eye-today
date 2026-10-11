// Pure helpers shared by the admin, the reader and the PDF. No I/O, no React.

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// "2026-10" (a <input type="month"> value) -> "2026-10-01"; anything else -> null.
export function monthDate(value: string): string | null {
  const m = /^(\d{4})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return `${m[1]}-${m[2]}-01`;
}

export const editionSlug = (issueMonth: string) => issueMonth.slice(0, 7);

export function issueLabel(issueMonth: string): string {
  const [year, month] = issueMonth.split("-").map(Number);
  return `${MONTHS[(month ?? 1) - 1] ?? ""} ${year}`.trim();
}

const DAY = 86_400_000;

export function supportersFrom(publicFromIso: string, days: number): string {
  const safe = Math.min(Math.max(Math.floor(days), 0), 30);
  return new Date(new Date(publicFromIso).getTime() - safe * DAY).toISOString();
}

export function earlyAccessDays(supporters: string | null, pub: string | null): number {
  if (!supporters || !pub) return 0;
  return Math.max(0, Math.round((new Date(pub).getTime() - new Date(supporters).getTime()) / DAY));
}

// One object per generation so a stale CDN or browser cache can never serve an old issue.
export const pdfObjectPath = (editionId: string, now = Date.now()) => `${editionId}/${now}.pdf`;

export type StoryStub = { article_slug: string; title: string; section_slug: string; section_name: string };

export type ReaderPage<S extends StoryStub = StoryStub> =
  | { id: "cover"; kind: "cover" }
  | { id: "contents"; kind: "contents" }
  | { id: "letter"; kind: "letter" }
  | { id: string; kind: "story"; story: S };

export function buildPages<S extends StoryStub>(edition: { letter_html: string }, stories: S[]): ReaderPage<S>[] {
  const pages: ReaderPage<S>[] = [{ id: "cover", kind: "cover" }, { id: "contents", kind: "contents" }];
  if (edition.letter_html.replace(/<[^>]+>/g, "").trim()) pages.push({ id: "letter", kind: "letter" });
  for (const story of stories) pages.push({ id: story.article_slug, kind: "story", story });
  return pages;
}
