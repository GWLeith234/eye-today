import { z } from "zod";

import { wallTimeToInstant } from "./time";
import { EVENT_TYPES } from "./types";

// Fields shared by the organiser form and the editor form. Times arrive as the organiser's wall
// date and time plus an IANA zone, and leave as UTC instants.
const base = z.object({
  title: z.string().trim().min(1).max(160),
  event_type: z.enum(EVENT_TYPES),
  attendance: z.enum(["online", "in_person"]),
  start_date: z.string().trim(),
  start_time: z.string().trim(),
  end_date: z.string().trim(),
  end_time: z.string().trim(),
  tz: z.string().trim().min(1).max(64),
  venue: z.string().trim().max(200),
  country: z.string().trim().refine((value) => value === "" || /^[A-Za-z]{2}$/.test(value)),
  city: z.string().trim().max(80),
  organiser_name: z.string().trim().min(1).max(160),
  price_note: z.string().trim().max(200),
  registration_url: z.string().trim().max(500).refine((value) => value === "" || /^https:\/\/[^\s<>"]+$/.test(value)),
  listing_slug: z.string().trim().max(120),
});

export type EventInput = {
  title: string;
  event_type: (typeof EVENT_TYPES)[number];
  attendance: "online" | "in_person";
  starts_at: string;
  ends_at: string;
  tz: string;
  venue: string;
  country: string;
  city: string;
  organiser_name: string;
  price_note: string;
  registration_url: string;
  listing_slug: string;
};

const FIELDS = [
  "title", "event_type", "attendance", "start_date", "start_time", "end_date", "end_time", "tz",
  "venue", "country", "city", "organiser_name", "price_note", "registration_url", "listing_slug",
] as const;

export function parseEventForm(formData: FormData): { ok: true; data: EventInput } | { ok: false; error: string } {
  const raw = Object.fromEntries(FIELDS.map((key) => [key, String(formData.get(key) ?? "")]));
  const parsed = base.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Check the title, type, organiser and dates. A registration link must start with https://." };
  }
  const d = parsed.data;
  if (d.attendance === "in_person" && !d.country) {
    return { ok: false, error: "An in-person event needs a two-letter country code." };
  }
  const starts = wallTimeToInstant(d.start_date, d.start_time, d.tz);
  const ends = wallTimeToInstant(d.end_date || d.start_date, d.end_time, d.tz);
  if (!starts || !ends) return { ok: false, error: "Check the dates, times and time zone." };
  if (ends.getTime() <= starts.getTime()) return { ok: false, error: "The event must end after it starts." };
  if (ends.getTime() - starts.getTime() > 60 * 24 * 60 * 60 * 1000) return { ok: false, error: "An event can last at most 60 days." };
  return {
    ok: true,
    data: {
      title: d.title.replace(/[<>]/g, ""),
      event_type: d.event_type,
      attendance: d.attendance,
      starts_at: starts.toISOString(),
      ends_at: ends.toISOString(),
      tz: d.tz,
      venue: d.venue.replace(/[<>]/g, ""),
      country: d.country.toUpperCase(),
      city: d.city.replace(/[<>]/g, ""),
      organiser_name: d.organiser_name.replace(/[<>]/g, ""),
      price_note: d.price_note.replace(/[<>]/g, ""),
      registration_url: d.registration_url,
      listing_slug: d.listing_slug.replace(/^.*\/directory\/listing\//, "").replace(/[/?#].*$/, "").toLowerCase(),
    },
  };
}
