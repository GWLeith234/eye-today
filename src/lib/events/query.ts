import { type EventType, isEventType } from "./types";

export type EventFilters = {
  type: EventType | "";
  country: string;
  online: boolean;
  when: "upcoming" | "past";
  page: number;
};

function one(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return "";
}

export function parseEventFilters(input: { type?: unknown; country?: unknown; online?: unknown; when?: unknown; page?: unknown }): EventFilters {
  const typeRaw = one(input.type).trim();
  const countryRaw = one(input.country).trim();
  const pageText = one(input.page);
  return {
    type: isEventType(typeRaw) ? typeRaw : "",
    country: /^[a-z]{2}$/i.test(countryRaw) ? countryRaw.toUpperCase() : "",
    online: one(input.online) === "1",
    when: one(input.when) === "past" ? "past" : "upcoming",
    page: /^\d{1,3}$/.test(pageText) ? Math.min(100, Math.max(1, Number(pageText))) : 1,
  };
}

export function eventsHref(filters: EventFilters, page = filters.page): string {
  const params = new URLSearchParams();
  if (filters.type) params.set("type", filters.type);
  if (filters.country) params.set("country", filters.country);
  if (filters.online) params.set("online", "1");
  if (filters.when === "past") params.set("when", "past");
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/events?${query}` : "/events";
}

// ?month=YYYY-MM within 24 months of `now`, else null. A missing month means the current UTC month.
export function parseMonth(value: unknown, now = new Date()): { year: number; month: number } | null {
  const text = one(value).trim();
  const current = { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
  if (!text) return current;
  const match = /^(\d{4})-(\d{2})$/.exec(text);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  const distance = (year - current.year) * 12 + (month - current.month);
  return Math.abs(distance) <= 24 ? { year, month } : null;
}

export function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function shiftMonth(year: number, month: number, by: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + by;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

// Weeks (Monday first) of day numbers for a month; null pads the edges.
export function monthGrid(year: number, month: number): (number | null)[][] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7;
  const cells: (number | null)[] = [...Array<null>(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
