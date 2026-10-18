import { TZDate } from "@date-fns/tz";

// The organiser picks a wall-clock date and time in their own IANA zone. This turns it into the
// absolute instant we store. Null when anything is malformed or the zone is unknown.
export function wallTimeToInstant(date: string, time: string, tz: string): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  const t = /^(\d{2}):(\d{2})$/.exec(time.trim());
  if (!d || !t || !isTimeZone(tz)) return null;
  const [year, month, day] = [Number(d[1]), Number(d[2]), Number(d[3])];
  const [hour, minute] = [Number(t[1]), Number(t[2])];
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  const zoned = new TZDate(year, month - 1, day, hour, minute, 0, tz);
  // Reject dates that roll over (31 February) so the stored instant is what the organiser typed.
  if (zoned.getFullYear() !== year || zoned.getMonth() !== month - 1 || zoned.getDate() !== day) return null;
  const instant = new Date(zoned.getTime());
  return Number.isNaN(instant.getTime()) ? null : instant;
}

export function isTimeZone(tz: string): boolean {
  if (!tz || tz.length > 64 || !/^[A-Za-z_+\-/0-9]+$/.test(tz)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function timeZoneOptions(): string[] {
  try {
    const zones = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.("timeZone");
    if (zones?.length) return zones.includes("UTC") ? zones : ["UTC", ...zones];
  } catch {
    // fall through
  }
  return ["UTC", "America/Vancouver", "America/Denver", "America/Chicago", "America/New_York", "America/Cancun", "Europe/London", "Africa/Johannesburg"];
}

// "Sat 4 July 2026, 7:00 PM PDT" in the event's own zone.
export function formatInZone(iso: string, tz: string, withTime = true): string {
  const date = new Date(iso);
  const zone = isTimeZone(tz) ? tz : "UTC";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit", timeZoneName: "short" } : {}),
  }).format(date);
}

// "Sat, July 4, 2026, 7:00 – 9:00 PM PDT", or both full dates when the event spans days.
export function formatRange(startIso: string, endIso: string, tz: string): string {
  const zone = isTimeZone(tz) ? tz : "UTC";
  const format = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
  return format.formatRange(new Date(startIso), new Date(endIso));
}

// The pieces the events page's date plate sets in type, worked out in the event's own zone.
//
// `end` is null for a single-day event. When an event runs on, `end.month` is null if it finishes in
// the same month as it started — the plate prints "27–29 JAN" — and set when it does not, so a
// 30 January to 2 February conference prints both months instead of claiming to be one day long.
//
// An event ending exactly at midnight does not run into the next day, so the end is nudged back 1ms:
// the same rule the calendar grid uses.
export type PlateDate = {
  start: { day: string; month: string };
  end: { day: string; month: string | null } | null;
  year: string;
};

export function plateDate(startsAt: string, endsAt: string, tz: string): PlateDate {
  const part = (iso: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-US", { timeZone: isTimeZone(tz) ? tz : "UTC", ...options }).format(new Date(iso));

  const lastInstant = new Date(new Date(endsAt).getTime() - 1).toISOString();
  const start = { day: part(startsAt, { day: "numeric" }), month: part(startsAt, { month: "short" }) };
  const year = part(startsAt, { year: "numeric" });

  const startKey = dayInZone(startsAt, tz);
  const endKey = dayInZone(lastInstant, tz);
  if (endKey <= startKey) return { start, end: null, year };

  const endMonth = part(lastInstant, { month: "short" });
  const endYear = part(lastInstant, { year: "numeric" });
  const sameMonth = endMonth === start.month && endYear === year;
  return {
    start,
    end: { day: part(lastInstant, { day: "numeric" }), month: sameMonth ? null : endMonth },
    year,
  };
}

// The calendar date (YYYY-MM-DD) an instant falls on in a zone.
export function dayInZone(iso: string, tz: string): string {
  const zone = isTimeZone(tz) ? tz : "UTC";
  return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

// For the admin form: the wall date and time of an instant in its zone.
export function instantToWallTime(iso: string, tz: string): { date: string; time: string } {
  const zone = isTimeZone(tz) ? tz : "UTC";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(iso))
      .map((part) => [part.type, part.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

// 20260702T020000Z
export function utcStamp(iso: string | Date): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}
