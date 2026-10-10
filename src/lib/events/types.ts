export const EVENT_TYPES = ["conference", "retreat", "webinar", "integration_circle", "training", "other"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  conference: "Conference",
  retreat: "Retreat",
  webinar: "Webinar",
  integration_circle: "Integration circle",
  training: "Training",
  other: "Other",
};

export type Attendance = "online" | "in_person";
export type EventStatus = "draft" | "pending" | "rejected" | "published" | "cancelled";

export function isEventType(value: string): value is EventType {
  return (EVENT_TYPES as readonly string[]).includes(value);
}

// events_list
export type EventCard = {
  id: string;
  slug: string;
  title: string;
  event_type: EventType;
  attendance: Attendance;
  starts_at: string;
  ends_at: string;
  tz: string;
  venue: string | null;
  country_code: string | null;
  city: string | null;
  organiser_name: string;
  price_note: string;
  image_storage_path: string | null;
  image_alt: string | null;
  promoted: boolean;
};

// upcoming_events, events_for_listing, events_in_month
export type EventSummary = {
  id: string;
  slug: string;
  title: string;
  event_type: EventType;
  attendance: Attendance;
  starts_at: string;
  ends_at: string;
  tz: string;
  city: string | null;
  country_code: string | null;
  promoted: boolean;
};

// event_by_slug
export type EventDetail = {
  id: string;
  slug: string;
  title: string;
  event_type: EventType;
  attendance: Attendance;
  starts_at: string;
  ends_at: string;
  tz: string;
  venue: string | null;
  country_code: string | null;
  city: string | null;
  organiser_name: string;
  price_note: string;
  registration_url: string | null;
  description_html: string;
  image_storage_path: string | null;
  image_alt: string | null;
  listing_slug: string | null;
  listing_name: string | null;
  promoted: boolean;
  status: "published" | "cancelled";
  updated_at: string;
};

// events_for_feed
export type FeedEvent = {
  id: string;
  slug: string;
  title: string;
  attendance: Attendance;
  starts_at: string;
  ends_at: string;
  venue: string | null;
  country_code: string | null;
  city: string | null;
  organiser_name: string;
  registration_url: string | null;
  description_html: string;
  updated_at: string;
};
