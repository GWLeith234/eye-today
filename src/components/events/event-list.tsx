import Image from "next/image";
import Link from "next/link";

import { eventPlace } from "@/lib/events/jsonld";
import { formatInZone, formatRange } from "@/lib/events/time";
import { EVENT_TYPE_LABELS, type EventCard, type EventSummary } from "@/lib/events/types";
import { mediaUrl } from "@/lib/media/url";

import { EventPoster } from "./event-poster";

export function PromotedBadge() {
  return (
    <span data-testid="promoted-badge" className="bg-accent px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-ink">
      Promoted
    </span>
  );
}

export function EventCardView({ event }: { event: EventCard }) {
  return (
    <article className="flex flex-col gap-4 border-t border-rule pt-4 sm:flex-row">
      <Link
        href={`/events/${event.slug}`}
        aria-hidden="true"
        tabIndex={-1}
        className="relative block aspect-[3/2] w-full shrink-0 overflow-hidden sm:w-56"
      >
        {event.image_storage_path ? (
          <Image
            src={mediaUrl(event.image_storage_path, { width: 640 })}
            alt={event.image_alt || ""}
            fill
            sizes="(min-width: 640px) 224px, 100vw"
            className="object-cover"
          />
        ) : (
          <EventPoster event={event} />
        )}
      </Link>
      <div className="flex min-w-0 flex-col gap-1">
        <p className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-widest">
          <span>{EVENT_TYPE_LABELS[event.event_type]}</span>
          {event.promoted ? <PromotedBadge /> : null}
        </p>
        <h3 className="font-serif text-xl font-semibold">
          <Link href={`/events/${event.slug}`} className="hover:underline">{event.title}</Link>
        </h3>
        <p className="text-sm">{formatRange(event.starts_at, event.ends_at, event.tz)}</p>
        <p className="text-sm text-muted">
          {eventPlace(event)} · {event.organiser_name}
          {event.price_note ? ` · ${event.price_note}` : ""}
        </p>
      </div>
    </article>
  );
}

// Compact list for the cover and listing pages.
export function UpcomingEvents({ events, heading = "Upcoming events", id = "upcoming-events" }: { events: EventSummary[]; heading?: string; id?: string }) {
  if (events.length === 0) return null;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3 border-t-2 border-ink pt-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={id} className="font-display text-2xl font-semibold">{heading}</h2>
        <Link href="/events" className="text-sm underline">All events</Link>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {events.map((event) => (
          <li key={event.id} className="flex flex-col gap-1">
            <p className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-widest">
              <span>{EVENT_TYPE_LABELS[event.event_type]}</span>
              {event.promoted ? <PromotedBadge /> : null}
            </p>
            <Link href={`/events/${event.slug}`} className="font-serif text-lg font-semibold hover:underline">{event.title}</Link>
            <p className="text-sm">{formatInZone(event.starts_at, event.tz)}</p>
            <p className="text-sm text-muted">{eventPlace(event)}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
