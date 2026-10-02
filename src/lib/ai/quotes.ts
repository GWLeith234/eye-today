// Whitespace-insensitive matching for copy-edit quotes.
// The match may cover a non-breaking space; the suggestion is inserted unchanged.

const WS = /[\t\n\r\f\v \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]/;

function isWhitespace(char: string) {
  return WS.test(char);
}

export function foldWhitespace(value: string): string {
  return value.replace(new RegExp(`${WS.source}+`, "g"), " ").trim();
}

export function foldMap(value: string): { folded: string; startAt: number[]; endAt: number[] } {
  let folded = "";
  const startAt: number[] = [];
  const endAt: number[] = [];
  let index = 0;
  while (index < value.length) {
    if (isWhitespace(value[index])) {
      const start = index;
      while (index < value.length && isWhitespace(value[index])) index += 1;
      folded += " ";
      startAt.push(start);
      endAt.push(index);
    } else {
      folded += value[index];
      startAt.push(index);
      endAt.push(index + 1);
      index += 1;
    }
  }
  return { folded, startAt, endAt };
}

export function quoteAppears(haystack: string, quote: string): boolean {
  const needle = foldWhitespace(quote);
  if (!needle) return false;
  return foldMap(haystack).folded.includes(needle);
}

// The only folded match, mapped back onto the original string. Null when it is missing or repeated.
export function locateQuote(haystack: string, quote: string): { start: number; end: number } | null {
  const needle = foldWhitespace(quote);
  if (!needle) return null;
  const { folded, startAt, endAt } = foldMap(haystack);
  const hits: { start: number; end: number }[] = [];
  let from = 0;
  while (from < folded.length) {
    const at = folded.indexOf(needle, from);
    if (at === -1) break;
    const start = startAt[at];
    const end = endAt[at + needle.length - 1];
    if (start !== undefined && end !== undefined) hits.push({ start, end });
    from = at + needle.length;
  }
  return hits.length === 1 ? hits[0] : null;
}

// Replaces the original span (NBSP and all) with `suggestion` exactly as given.
export function replaceQuoteOnce(text: string, quote: string, suggestion: string): string | null {
  const hit = locateQuote(text, quote);
  if (!hit) return null;
  return text.slice(0, hit.start) + suggestion + text.slice(hit.end);
}

export type PanelChrome = {
  error: null;
  notes: Record<string, string>;
  run: null;
  stamp: null;
};

// What the assistant panel clears when a new run starts, including a previous "Accepted by you" stamp.
export function chromeForNewRun(): PanelChrome {
  return { error: null, notes: {}, run: null, stamp: null };
}
