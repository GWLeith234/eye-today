import "server-only";

import { absoluteUrl } from "@/lib/public/site";

import { buildCalendar, htmlToText, type IcsEvent } from "./ics";
import { eventPlace } from "./jsonld";

type Row = {
  id: string;
  slug: string;
  title: string;
  attendance: string;
  starts_at: string;
  ends_at: string;
  venue: string | null;
  city: string | null;
  country_code: string | null;
  registration_url: string | null;
  description_html: string;
  updated_at: string;
};

export function toIcsEvent(row: Row): IcsEvent {
  return {
    id: row.id,
    title: row.title,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    updated_at: row.updated_at,
    url: absoluteUrl(`/events/${row.slug}`),
    location: row.attendance === "online" ? row.registration_url ?? "Online" : eventPlace(row) || null,
    description: htmlToText(row.description_html),
  };
}

export function icsResponse(rows: Row[], name: string, filename: string): Response {
  return new Response(buildCalendar(rows.map(toIcsEvent), { name }), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "public, max-age=300",
    },
  });
}
