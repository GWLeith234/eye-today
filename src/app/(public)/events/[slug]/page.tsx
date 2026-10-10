import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PromotedBadge } from "@/components/events/event-list";
import { EventsFrame } from "@/components/events/events-frame";
import { sanitizeArticleHtml } from "@/lib/editor/sanitize";
import { googleCalendarUrl, htmlToText } from "@/lib/events/ics";
import { eventJsonLd, eventPlace } from "@/lib/events/jsonld";
import { getEvent } from "@/lib/events/public";
import { formatRange } from "@/lib/events/time";
import { EVENT_TYPE_LABELS } from "@/lib/events/types";
import { mediaUrl } from "@/lib/media/url";
import { absoluteUrl } from "@/lib/public/site";
import { SLUG_RE } from "@/lib/slug";

export const revalidate = 60;

export async function generateStaticParams() {
  return [];
}

async function load(slug: string) {
  if (!SLUG_RE.test(slug) || slug === "submit") return null;
  return getEvent(slug);
}

export async function generateMetadata({ params }: PageProps<"/events/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const event = await load(slug);
  if (!event) return {};
  const canonical = `/events/${event.slug}`;
  const description = htmlToText(event.description_html).slice(0, 200) || `${event.title}, ${eventPlace(event)}.`;
  return {
    title: event.status === "cancelled" ? `Cancelled: ${event.title}` : event.title,
    description,
    alternates: { canonical },
    openGraph: { title: event.title, description, url: canonical },
  };
}

export default async function EventPage({ params }: PageProps<"/events/[slug]">) {
  const { slug } = await params;
  const event = await load(slug);
  if (!event) notFound();

  const canonical = `/events/${event.slug}`;
  const pageUrl = absoluteUrl(canonical);
  const imageUrl = event.image_storage_path ? mediaUrl(event.image_storage_path, { width: 1600 }) : null;
  const jsonLd = eventJsonLd(event, { pageUrl: pageUrl.startsWith("http") ? pageUrl : null, imageUrl });
  const cancelled = event.status === "cancelled";
  const place = eventPlace(event);
  const google = googleCalendarUrl({
    title: event.title,
    starts_at: event.starts_at,
    ends_at: event.ends_at,
    details: [htmlToText(event.description_html), pageUrl].filter(Boolean).join("\n\n"),
    location: event.attendance === "online" ? null : place,
  });

  return (
    <EventsFrame>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <article className="flex flex-col gap-4">
        {cancelled ? (
          <p role="status" data-testid="cancelled-banner" className="border-2 border-ink bg-ink px-3 py-2 font-semibold text-paper">
            Cancelled. This event will not go ahead as listed.
          </p>
        ) : null}
        <p className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-widest">
          <Link href={`/events?type=${event.event_type}`} className="hover:underline">{EVENT_TYPE_LABELS[event.event_type]}</Link>
          {event.promoted ? <PromotedBadge /> : null}
        </p>
        <h1 className={`font-serif text-4xl font-bold ${cancelled ? "line-through decoration-2" : ""}`}>{event.title}</h1>
        {imageUrl ? (
          <div className="relative aspect-[16/9] w-full max-w-3xl">
            <Image src={imageUrl} alt={event.image_alt || ""} fill sizes="(min-width: 768px) 48rem, 100vw" className="object-cover" priority />
          </div>
        ) : null}
        <dl className="grid gap-2 text-sm sm:grid-cols-[10rem_1fr]">
          <dt className="font-semibold">When</dt>
          <dd>{formatRange(event.starts_at, event.ends_at, event.tz)}</dd>
          <dt className="font-semibold">Where</dt>
          <dd>{place}</dd>
          <dt className="font-semibold">Organiser</dt>
          <dd>{event.organiser_name}</dd>
          {event.price_note ? (
            <>
              <dt className="font-semibold">Price</dt>
              <dd>{event.price_note}</dd>
            </>
          ) : null}
          {event.listing_slug && event.listing_name ? (
            <>
              <dt className="font-semibold">In the directory</dt>
              <dd><Link href={`/directory/listing/${event.listing_slug}`} className="text-accent underline">{event.listing_name}</Link></dd>
            </>
          ) : null}
        </dl>
        {!cancelled ? (
          <p className="flex flex-wrap gap-3 text-sm">
            {event.registration_url ? (
              <a href={event.registration_url} rel="noopener noreferrer nofollow" target="_blank" className="rounded bg-ink px-4 py-2 text-paper">
                Register with the organiser
              </a>
            ) : null}
            <a href={`/events/${event.slug}/event.ics`} className="rounded border border-rule px-4 py-2">Add to calendar (.ics)</a>
            <a href={google} rel="noopener noreferrer" target="_blank" className="rounded border border-rule px-4 py-2">Google Calendar</a>
          </p>
        ) : null}
        {event.description_html ? (
          <div className="article-body flex max-w-2xl flex-col gap-4" dangerouslySetInnerHTML={{ __html: sanitizeArticleHtml(event.description_html) }} />
        ) : null}
        <p className="text-xs text-muted">Details come from the organiser and were checked by an editor before publishing. Confirm dates and prices with the organiser.</p>
      </article>
    </EventsFrame>
  );
}
