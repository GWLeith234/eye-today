import { countryName } from "@/lib/directory/countries";
import { isTimeZone } from "@/lib/events/time";
import type { Attendance, EventType } from "@/lib/events/types";
import { onBand } from "@/lib/brand/palette";

// Most of what gets listed here is somebody else's conference, and their artwork is theirs. So an
// event with no picture of its own gets a plate drawn from its own facts instead of a grey box: the
// date, the kind of thing it is, and where it happens. It is deterministic — the same event always
// draws the same plate — and it costs no upload, no storage row and no network request, so the page
// is never waiting on an editor before it looks like a page.
//
// An editor who does have a licensed photo still wins: the card prefers the uploaded image and this
// only stands in. The plate repeats what the card already says in text, so it is hidden from screen
// readers rather than read out twice.

// Keyed to the section palette, so an events page sits in the same colour world as the paper.
const FIELD: Record<EventType, string> = {
  conference: "#1E5B4A",
  retreat: "#976912",
  webinar: "#2F6FA3",
  integration_circle: "#6B4C9A",
  training: "#A9472F",
  other: "#3F3F46",
};

export type PosterEvent = {
  event_type: EventType;
  attendance: Attendance;
  starts_at: string;
  ends_at: string;
  tz: string;
  city: string | null;
  country_code: string | null;
};

function part(iso: string, tz: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: isTimeZone(tz) ? tz : "UTC", ...options }).format(new Date(iso));
}

// "27" for a single day, "27–29" when it runs on into the following days of the same month. An
// event ending exactly at midnight does not run on the next day, so the end is nudged back 1ms —
// the same rule the calendar grid uses.
function days(event: PosterEvent): string {
  const last = new Date(new Date(event.ends_at).getTime() - 1).toISOString();
  const start = part(event.starts_at, event.tz, { day: "numeric" });
  const end = part(last, event.tz, { day: "numeric" });
  const sameMonth = part(event.starts_at, event.tz, { month: "short", year: "numeric" }) === part(last, event.tz, { month: "short", year: "numeric" });
  return sameMonth && start !== end ? `${start}–${end}` : start;
}

// The city alone. The card beside the plate already gives the full "Tacoma, United States", and a
// country name repeated here only ran off the edge of a 224px plate.
function where(event: PosterEvent): string {
  if (event.attendance === "online") return "Online";
  return event.city || (event.country_code ? countryName(event.country_code) : "") || "Venue to be announced";
}

export function EventPoster({ event }: { event: PosterEvent }) {
  const field = FIELD[event.event_type] ?? FIELD.other;
  const ink = onBand(field);
  const month = part(event.starts_at, event.tz, { month: "short" });
  const year = part(event.starts_at, event.tz, { year: "numeric" });

  return (
    <div
      aria-hidden="true"
      data-testid="event-poster"
      className="absolute inset-0 flex flex-col justify-end gap-1 overflow-hidden p-4"
      style={{ background: field, color: ink }}
    >
      {/* The masthead iris, bled off the corner at low contrast, so a wall of plates still reads as us. */}
      <svg viewBox="0 0 32 32" className="pointer-events-none absolute -right-7 -top-8 size-36 opacity-[0.14]" aria-hidden="true" focusable="false">
        <circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" strokeWidth="2.4" />
        <circle cx="16" cy="16" r="5.5" fill="currentColor" />
      </svg>
      {/* No event-type word: the card already prints it an inch to the right, and the field colour
          carries the same signal without saying it twice. */}
      <p className="relative flex items-baseline gap-2">
        <span className="font-display text-5xl font-semibold leading-none">{days(event)}</span>
        <span className="font-display text-xl font-semibold uppercase leading-none">{month}</span>
      </p>
      <p className="relative truncate text-xs font-semibold uppercase tracking-wider">
        {where(event)} <span className="opacity-70">· {year}</span>
      </p>
    </div>
  );
}
