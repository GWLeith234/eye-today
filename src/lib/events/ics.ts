import { utcStamp } from "./time";

// RFC 5545. Times are UTC (trailing Z) taken from the stored instant, so there is no TZID or
// VTIMEZONE for a calendar app to get wrong.

export type IcsEvent = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  updated_at: string;
  url: string;
  location: string | null;
  description: string;
  status?: "published" | "cancelled";
};

export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

// Lines longer than 75 octets continue on the next line after CRLF and one space.
// Never split inside a UTF-8 sequence.
export function foldLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const out: string[] = [];
  let current = "";
  let size = 0;
  let limit = 75;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    if (size + bytes > limit) {
      out.push(current);
      current = "";
      size = 0;
      limit = 74; // the leading space counts
    }
    current += char;
    size += bytes;
  }
  out.push(current);
  return out.join("\r\n ");
}

// Description text for the calendar: tags removed, entities decoded, paragraphs kept.
export function htmlToText(html: string): string {
  return html
    .replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function vevent(event: IcsEvent, stamp: string): string[] {
  const lines = [
    "BEGIN:VEVENT",
    `UID:${event.id}@eyetoday`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${utcStamp(event.starts_at)}`,
    `DTEND:${utcStamp(event.ends_at)}`,
    `LAST-MODIFIED:${utcStamp(event.updated_at)}`,
    `SUMMARY:${escapeText(event.title)}`,
    `URL:${event.url}`,
  ];
  if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
  const description = [event.description, event.url].filter(Boolean).join("\n\n");
  if (description) lines.push(`DESCRIPTION:${escapeText(description.slice(0, 2000))}`);
  if (event.status === "cancelled") lines.push("STATUS:CANCELLED");
  lines.push("END:VEVENT");
  return lines;
}

export function buildCalendar(events: IcsEvent[], options: { name: string; now?: Date }): string {
  const stamp = utcStamp(options.now ?? new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Eye Today//Events//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(options.name)}`,
    ...events.flatMap((event) => vevent(event, stamp)),
    "END:VCALENDAR",
  ];
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

export function googleCalendarUrl(event: { title: string; starts_at: string; ends_at: string; details: string; location: string | null }): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${utcStamp(event.starts_at)}/${utcStamp(event.ends_at)}`,
    details: event.details.slice(0, 1500),
  });
  if (event.location) params.set("location", event.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
