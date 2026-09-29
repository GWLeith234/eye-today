// The frequency cookie: which creatives this browser has been served today, and how often.
// Not signed and not a secret: clearing it only means seeing an ad again.

export const FREQ_COOKIE = "ad_freq";
const MAX_ENTRIES = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type Frequency = { day: string; counts: Record<string, number> };

export const utcDay = (now: Date) => now.toISOString().slice(0, 10);

// "2026-09-29_<uuid>~2.<uuid>~1". Anything from another day, or malformed, reads as empty.
export function parseFrequency(raw: string | null | undefined, today: string): Frequency {
  const empty: Frequency = { day: today, counts: {} };
  if (!raw) return empty;
  const [day, rest] = raw.split("_", 2);
  if (day !== today || !rest) return empty;
  const counts: Record<string, number> = {};
  for (const entry of rest.split(".")) {
    const [id, count] = entry.split("~");
    const n = Number(count);
    if (UUID.test(id ?? "") && Number.isInteger(n) && n > 0 && n < 10_000) counts[id] = n;
  }
  return { day: today, counts };
}

export function serializeFrequency(freq: Frequency): string {
  const entries = Object.entries(freq.counts).slice(-MAX_ENTRIES);
  return `${freq.day}_${entries.map(([id, n]) => `${id}~${n}`).join(".")}`;
}

export const capReached = (freq: Frequency, creativeId: string, cap: number | null) =>
  cap !== null && (freq.counts[creativeId] ?? 0) >= cap;

export function withServed(freq: Frequency, creativeId: string): Frequency {
  const { [creativeId]: current = 0, ...others } = freq.counts;
  return { day: freq.day, counts: { ...others, [creativeId]: current + 1 } };
}
