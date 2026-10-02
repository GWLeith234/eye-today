// In-memory window per server process. A second instance has its own counters.
// Enough to blunt a burst; the database triggers remain the durable limits.

const buckets = new Map<string, number[]>();
const MAX_KEYS = 5000;

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const recent = (buckets.get(key) ?? []).filter((at) => now - at < windowMs);
  if (recent.length >= limit) {
    buckets.set(key, recent);
    return false;
  }
  recent.push(now);
  buckets.set(key, recent);
  if (buckets.size > MAX_KEYS) {
    const oldest = buckets.keys().next().value;
    if (oldest !== undefined) buckets.delete(oldest);
  }
  return true;
}

export function resetRateLimits() {
  buckets.clear();
}

export function forwardedIp(header: string | null): string {
  const ip = header?.split(",")[0]?.trim();
  return ip || "unknown";
}
