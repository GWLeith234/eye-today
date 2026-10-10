import {
  CLASSIFIED_CATEGORIES,
  type ClassifiedCategory,
  EMPLOYMENT_TYPES,
  type EmploymentType,
  type PostingKind,
  REMOTE_OPTIONS,
  type Remote,
  BOARD,
} from "./types";

export type PostingFilters = {
  type: EmploymentType | ClassifiedCategory | "";
  country: string;
  remote: Remote | "";
  page: number;
};

function one(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return "";
}

export function parsePostingFilters(kind: PostingKind, input: { type?: unknown; country?: unknown; remote?: unknown; page?: unknown }): PostingFilters {
  const typeRaw = one(input.type).trim();
  const allowed: readonly string[] = kind === "job" ? EMPLOYMENT_TYPES : CLASSIFIED_CATEGORIES;
  const countryRaw = one(input.country).trim();
  const remoteRaw = one(input.remote).trim();
  const pageText = one(input.page);
  return {
    type: allowed.includes(typeRaw) ? (typeRaw as PostingFilters["type"]) : "",
    country: /^[a-z]{2}$/i.test(countryRaw) ? countryRaw.toUpperCase() : "",
    remote: (REMOTE_OPTIONS as readonly string[]).includes(remoteRaw) ? (remoteRaw as Remote) : "",
    page: /^\d{1,3}$/.test(pageText) ? Math.min(100, Math.max(1, Number(pageText))) : 1,
  };
}

export function postingsHref(kind: PostingKind, filters: PostingFilters, page = filters.page): string {
  const params = new URLSearchParams();
  if (filters.type) params.set("type", filters.type);
  if (filters.country) params.set("country", filters.country);
  if (filters.remote) params.set("remote", filters.remote);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `${BOARD[kind].path}?${query}` : BOARD[kind].path;
}

const PERIOD: Record<string, string> = { hour: "an hour", month: "a month", year: "a year" };

// "USD 50,000–60,000 a year", "From USD 50,000 a year", or null.
export function salaryText(p: { salary_min: number | null; salary_max: number | null; salary_currency: string | null; salary_period: string | null }): string | null {
  if (!p.salary_currency || (p.salary_min === null && p.salary_max === null)) return null;
  const n = (value: number) => new Intl.NumberFormat("en-US").format(value);
  const period = p.salary_period ? ` ${PERIOD[p.salary_period] ?? ""}`.trimEnd() : "";
  if (p.salary_min !== null && p.salary_max !== null) {
    return p.salary_min === p.salary_max
      ? `${p.salary_currency} ${n(p.salary_min)}${period}`
      : `${p.salary_currency} ${n(p.salary_min)}–${n(p.salary_max)}${period}`;
  }
  if (p.salary_min !== null) return `From ${p.salary_currency} ${n(p.salary_min)}${period}`;
  return `Up to ${p.salary_currency} ${n(p.salary_max!)}${period}`;
}
