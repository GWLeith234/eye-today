import { countryName } from "@/lib/directory/countries";

import { htmlToText } from "./ics";
import type { EventDetail } from "./types";

// schema.org Event. Public fields only: no price, rating or contact details.
export function eventJsonLd(event: EventDetail, options: { pageUrl: string | null; imageUrl: string | null }) {
  const online = event.attendance === "online";
  const description = htmlToText(event.description_html).slice(0, 500);
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    startDate: new Date(event.starts_at).toISOString(),
    endDate: new Date(event.ends_at).toISOString(),
    eventAttendanceMode: online ? "https://schema.org/OnlineEventAttendanceMode" : "https://schema.org/OfflineEventAttendanceMode",
    eventStatus: event.status === "cancelled" ? "https://schema.org/EventCancelled" : "https://schema.org/EventScheduled",
    location: online
      ? { "@type": "VirtualLocation", ...(event.registration_url ? { url: event.registration_url } : {}) }
      : {
          "@type": "Place",
          ...(event.venue ? { name: event.venue } : {}),
          address: {
            "@type": "PostalAddress",
            ...(event.city ? { addressLocality: event.city } : {}),
            ...(event.country_code ? { addressCountry: event.country_code } : {}),
          },
        },
    organizer: { "@type": "Organization", name: event.organiser_name },
    ...(description ? { description } : {}),
    ...(options.imageUrl ? { image: [options.imageUrl] } : {}),
    ...(options.pageUrl ? { url: options.pageUrl } : {}),
  };
}

export function eventPlace(event: { attendance: string; venue?: string | null; city: string | null; country_code: string | null }): string {
  if (event.attendance === "online") return "Online";
  return [event.venue, event.city, event.country_code ? countryName(event.country_code) : null].filter(Boolean).join(", ");
}
