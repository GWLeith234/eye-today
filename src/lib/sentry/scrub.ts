const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const SECRET = /\b(?:bearer\s+)?(?:sk|pk|rk|whsec)_[A-Za-z0-9_]+/gi;

export function scrubText(value: string): string {
  return value.replace(EMAIL, "[email]").replace(SECRET, "[token]");
}

function scrubValue(value: unknown): unknown {
  if (typeof value === "string") return scrubText(value);
  if (Array.isArray(value)) return value.map(scrubValue);
  if (value && typeof value === "object") {
    const copy: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (/authorization|cookie|token|password|secret|email|api[_-]?key/i.test(key)) continue;
      copy[key] = scrubValue(item);
    }
    return copy;
  }
  return value;
}

// Drops emails, tokens and credential headers before an event leaves the process.
export function scrubSentryEvent<T>(event: T): T {
  return scrubValue(event) as T;
}
