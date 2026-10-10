import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EventCardView } from "@/components/events/event-list";
import { EventsFrame } from "@/components/events/events-frame";
import { eventsHref, monthGrid, monthKey, parseEventFilters, parseMonth, shiftMonth } from "@/lib/events/query";
import { countEvents, eventsInMonth, listEvents } from "@/lib/events/public";
import { dayInZone } from "@/lib/events/time";
import { EVENT_TYPE_LABELS, EVENT_TYPES, type EventSummary } from "@/lib/events/types";

export const metadata: Metadata = {
  title: "Events",
  description: "Retreats, conferences, webinars and integration circles in the ibogaine and psychedelic community.",
  alternates: { canonical: "/events" },
};

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const field = "rounded border border-rule bg-paper px-3 py-2 text-sm";

export default async function EventsPage({ searchParams }: PageProps<"/events">) {
  const params = await searchParams;
  if (params.view === "calendar") return <Calendar month={params.month} />;

  const filters = parseEventFilters(params);
  const [events, total] = await Promise.all([listEvents(filters), countEvents(filters)]);
  const pages = Math.max(1, Math.ceil(total / 24));

  return (
    <EventsFrame>
      <h1 className="font-serif text-4xl font-bold">{filters.when === "past" ? "Past events" : "Events"}</h1>
      <p className="max-w-2xl">
        Retreats, conferences, webinars and integration circles, submitted by organisers and checked by an editor before they appear. A listing here is not an endorsement.
      </p>
      <form method="get" action="/events" className="flex flex-wrap items-end gap-3" aria-label="Filter events">
        <label className="flex flex-col gap-1 text-sm">
          Type
          <select name="type" defaultValue={filters.type} className={field}>
            <option value="">All types</option>
            {EVENT_TYPES.map((type) => (
              <option key={type} value={type}>{EVENT_TYPE_LABELS[type]}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Country code
          <input name="country" maxLength={2} placeholder="MX" defaultValue={filters.country} className={`${field} w-24 uppercase`} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="online" value="1" defaultChecked={filters.online} /> Online only
        </label>
        <label className="flex flex-col gap-1 text-sm">
          When
          <select name="when" defaultValue={filters.when} className={field}>
            <option value="upcoming">Upcoming</option>
            <option value="past">Past</option>
          </select>
        </label>
        <button type="submit" className="rounded bg-ink px-4 py-2 text-sm text-paper">Show events</button>
      </form>

      {events.length === 0 ? (
        <p role="status">No events match.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {events.map((event) => (
            <li key={event.id}>
              <EventCardView event={event} />
            </li>
          ))}
        </ul>
      )}

      {pages > 1 ? (
        <nav aria-label="Pages" className="flex gap-4 text-sm">
          {filters.page > 1 ? <Link href={eventsHref(filters, filters.page - 1)} className="underline">Previous</Link> : null}
          <span>Page {filters.page} of {pages}</span>
          {filters.page < pages ? <Link href={eventsHref(filters, filters.page + 1)} className="underline">Next</Link> : null}
        </nav>
      ) : null}
      <p className="text-sm">
        {filters.when === "past" ? <Link href="/events" className="underline">Upcoming events</Link> : <Link href="/events?when=past" className="underline">Past events</Link>}
      </p>
    </EventsFrame>
  );
}

// Each event appears on every day it runs, counted in the event's own time zone.
function byDay(events: EventSummary[], year: number, month: number): Map<number, EventSummary[]> {
  const days = new Map<number, EventSummary[]>();
  const prefix = monthKey(year, month);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  for (const event of events) {
    const startKey = dayInZone(event.starts_at, event.tz);
    // An event ending exactly at midnight does not run on the next day.
    const endKey = dayInZone(new Date(new Date(event.ends_at).getTime() - 1).toISOString(), event.tz);
    for (let day = 1; day <= last; day += 1) {
      const key = `${prefix}-${String(day).padStart(2, "0")}`;
      if (key >= startKey && key <= endKey) days.set(day, [...(days.get(day) ?? []), event]);
    }
  }
  return days;
}

async function Calendar({ month }: { month: unknown }) {
  const parsed = parseMonth(month);
  if (!parsed) notFound();
  const { year, month: m } = parsed;
  const events = await eventsInMonth(year, m);
  const days = byDay(events, year, m);
  const label = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, m - 1, 1)));
  const prev = shiftMonth(year, m, -1);
  const next = shiftMonth(year, m, 1);

  return (
    <EventsFrame>
      <h1 className="font-serif text-4xl font-bold">Events calendar</h1>
      <nav aria-label="Months" className="flex items-center gap-4 text-sm">
        {parseMonth(monthKey(prev.year, prev.month)) ? (
          <Link href={`/events?view=calendar&month=${monthKey(prev.year, prev.month)}`} className="underline">← {monthKey(prev.year, prev.month)}</Link>
        ) : null}
        {parseMonth(monthKey(next.year, next.month)) ? (
          <Link href={`/events?view=calendar&month=${monthKey(next.year, next.month)}`} className="underline">{monthKey(next.year, next.month)} →</Link>
        ) : null}
        <Link href="/events" className="underline">List view</Link>
      </nav>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[42rem] table-fixed border-collapse text-sm">
          <caption className="mb-2 text-left font-serif text-2xl font-semibold">{label}</caption>
          <thead>
            <tr>
              {WEEKDAYS.map((day) => (
                <th key={day} scope="col" className="border border-rule p-1 text-left font-semibold">
                  <abbr title={day} className="no-underline">{day.slice(0, 3)}</abbr>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {monthGrid(year, m).map((week, index) => (
              <tr key={index}>
                {week.map((day, cell) =>
                  day === null ? (
                    <td key={cell} className="border border-rule bg-white/30" />
                  ) : (
                    <td key={cell} className="h-24 border border-rule p-1 align-top">
                      <span className="text-xs font-semibold">{day}</span>
                      <ul className="mt-1 flex flex-col gap-1">
                        {(days.get(day) ?? []).map((event) => (
                          <li key={event.id}>
                            <Link href={`/events/${event.slug}`} className="block truncate text-xs underline" title={event.title}>
                              {event.title}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {events.length === 0 ? <p role="status">No events this month.</p> : null}
    </EventsFrame>
  );
}
