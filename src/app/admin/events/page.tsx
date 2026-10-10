import Link from "next/link";

import { requireArea } from "@/lib/auth/session";
import { formatInZone } from "@/lib/events/time";
import { EVENT_TYPE_LABELS, type EventType } from "@/lib/events/types";

import { reviewEvent } from "./actions";

const ERRORS: Record<string, string> = {
  invalid: "That form was not valid.",
  not_found: "That event was not found.",
  reason: "A rejection needs a reason the organiser will see.",
  not_published: "Only a published event can be cancelled.",
  save_failed: "The change could not be saved.",
};

const DONE: Record<string, string> = {
  approve: "Event published.",
  reject: "Event rejected. The organiser can fix it and resubmit.",
  cancel: "Event cancelled. Its page stays up with a Cancelled banner.",
  unpublish: "Event moved back to draft.",
};

const ORDER = ["pending", "rejected", "draft", "published", "cancelled"] as const;

type Row = {
  id: string;
  slug: string;
  title: string;
  event_type: EventType;
  status: (typeof ORDER)[number];
  starts_at: string;
  tz: string;
  organiser_name: string;
  promoted_until: string | null;
  created_at: string;
};

export default async function EventsAdminPage({ searchParams }: PageProps<"/admin/events">) {
  const { supabase } = await requireArea("admin");
  const params = await searchParams;
  const error = typeof params.error === "string" ? ERRORS[params.error] : undefined;
  const done = typeof params.saved === "string" ? DONE[params.saved] : undefined;

  const { data } = await supabase
    .from("events")
    .select("id, slug, title, event_type, status, starts_at, tz, organiser_name, promoted_until, created_at")
    .order("starts_at", { ascending: true })
    .limit(300)
    .returns<Row[]>();
  const rows = data ?? [];
  const groups = ORDER.map((status) => ({ status, rows: rows.filter((row) => row.status === status) })).filter((group) => group.rows.length);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold">Events</h1>
        <Link href="/admin/events/new" className="rounded bg-ink px-3 py-1.5 text-sm text-paper">New event</Link>
      </div>
      {error ? <p role="alert" className="rounded border border-red-600 p-2 text-sm">{error}</p> : null}
      {done ? <p role="status" className="rounded border border-green-600 p-2 text-sm">{done}</p> : null}
      {groups.length === 0 ? <p className="text-sm">No events yet.</p> : null}
      {groups.map((group) => (
        <section key={group.status} aria-labelledby={`events-${group.status}`} className="flex flex-col gap-2">
          <h2 id={`events-${group.status}`} className="text-lg font-semibold capitalize">
            {group.status} ({group.rows.length})
          </h2>
          <ul className="flex flex-col gap-2">
            {group.rows.map((row) => (
              <li key={row.id} data-event-id={row.id} className="flex flex-col gap-2 border border-rule p-3 text-sm">
                <p className="flex flex-wrap items-baseline gap-2">
                  <Link href={`/admin/events/${row.id}`} className="font-semibold underline">{row.title}</Link>
                  <span>{EVENT_TYPE_LABELS[row.event_type]}</span>
                  <span className="text-muted">{formatInZone(row.starts_at, row.tz)}</span>
                  <span className="text-muted">by {row.organiser_name}</span>
                  {row.promoted_until && new Date(row.promoted_until) > new Date() ? <span className="bg-accent px-1 text-xs font-semibold uppercase">Promoted</span> : null}
                </p>
                {row.status === "pending" || row.status === "rejected" || row.status === "draft" ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <form action={reviewEvent}>
                      <input type="hidden" name="id" value={row.id} />
                      <input type="hidden" name="action" value="approve" />
                      <button type="submit" className="rounded bg-ink px-3 py-1 text-paper">Approve</button>
                    </form>
                    {row.status !== "rejected" ? (
                      <form action={reviewEvent} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="id" value={row.id} />
                        <input type="hidden" name="action" value="reject" />
                        <input name="reason" required maxLength={500} aria-label={`Reason for rejecting ${row.title}`} placeholder="Reason (the organiser sees this)" className="rounded border border-rule bg-paper px-2 py-1" />
                        <button type="submit" className="rounded border border-rule px-3 py-1">Reject</button>
                      </form>
                    ) : null}
                  </div>
                ) : null}
                {row.status === "published" ? (
                  <p className="flex gap-3">
                    <Link href={`/events/${row.slug}`} className="underline">View</Link>
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
