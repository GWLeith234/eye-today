import { countryName } from "@/lib/directory/countries";
import { plateDate } from "@/lib/events/time";
import type { Attendance, EventType } from "@/lib/events/types";
import { EVENT_TYPE_COLORS, onBand } from "@/lib/brand/palette";

// Most of what gets listed here is somebody else's conference, and their artwork is theirs. So an
// event with no picture of its own gets a plate drawn from its own facts instead of a grey box: the
// date, the kind of thing it is, and where it happens. It is deterministic — the same event always
// draws the same plate — and it costs no upload, no storage row and no network request, so the page
// is never waiting on an editor before it looks like a page.
//
// An editor who does have a licensed photo still wins: the card prefers the uploaded image and this
// only stands in. The plate repeats what the card already says in text, so it is hidden from screen
// readers rather than read out twice.

export type PosterEvent = {
  event_type: EventType;
  attendance: Attendance;
  starts_at: string;
  ends_at: string;
  tz: string;
  city: string | null;
  country_code: string | null;
};

// The city alone. The card beside the plate already gives the full "Tacoma, United States", and a
// country name repeated here only ran off the edge of a 224px plate.
function where(event: PosterEvent): string {
  if (event.attendance === "online") return "Online";
  return event.city || (event.country_code ? countryName(event.country_code) : "") || "Venue to be announced";
}

export function EventPoster({ event }: { event: PosterEvent }) {
  const field = EVENT_TYPE_COLORS[event.event_type] ?? EVENT_TYPE_COLORS.other;
  const ink = onBand(field);
  const date = plateDate(event.starts_at, event.ends_at, event.tz);
  // An event that runs into another month needs both months, so it is set on two lines at a smaller
  // size. Everything else keeps the big day and a single month beside it.
  const spansMonths = Boolean(date.end?.month);

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
      {spansMonths ? (
        <p className="relative font-display text-3xl font-semibold leading-none">
          <span className="block">
            {date.start.day} <span className="text-xl uppercase">{date.start.month}</span>
          </span>
          <span className="block">
            &ndash;{date.end!.day} <span className="text-xl uppercase">{date.end!.month}</span>
          </span>
        </p>
      ) : (
        <p className="relative flex items-baseline gap-2">
          <span className="font-display text-5xl font-semibold leading-none">
            {date.end ? `${date.start.day}–${date.end.day}` : date.start.day}
          </span>
          <span className="font-display text-xl font-semibold uppercase leading-none">{date.start.month}</span>
        </p>
      )}
      <p className="relative truncate text-xs font-semibold uppercase tracking-wider">
        {where(event)} <span className="opacity-70">· {date.year}</span>
      </p>
    </div>
  );
}
