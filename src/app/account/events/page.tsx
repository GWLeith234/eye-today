import Link from "next/link";

import { requireArea } from "@/lib/auth/session";
import { formatInZone } from "@/lib/events/time";
import { EVENT_TYPE_LABELS, type EventStatus, type EventType } from "@/lib/events/types";

export const dynamic = "force-dynamic";

const NOTICES: Record<string, string> = {
  submitted: "Thank you. An editor will review your event before it appears.",
  resubmitted: "Thank you. Your changes are back with an editor.",
};

const STATUS: Record<EventStatus, string> = {
  draft: "Draft",
  pending: "Waiting for review",
  rejected: "Not approved",
  published: "Published",
  cancelled: "Cancelled",
};

type Row = {
  id: string;
  slug: string;
  title: string;
  event_type: EventType;
  status: EventStatus;
  starts_at: string;
  tz: string;
  reject_reason: string | null;
};

export default async function AccountEventsPage({ searchParams }: PageProps<"/account/events">) {
  const { supabase, user } = await requireArea("account");
  const params = await searchParams;
  const notice = Object.keys(NOTICES).map((key) => (params[key] === "1" ? NOTICES[key] : null)).find(Boolean);
  const error = params.error === "not_found" ? "That event can’t be edited." : null;

  // RLS returns only this person's rows here unless they are an editor, so filter explicitly too.
  const { data } = await supabase
    .from("events")
    .select("id, slug, title, event_type, status, starts_at, tz, reject_reason")
    .eq("organiser_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100)
    .returns<Row[]>();
  const rows = data ?? [];

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold">Your events</h1>
        <p className="text-sm text-muted">
          Events you have submitted. <Link href="/events/submit" className="underline">Add an event</Link> · <Link href="/account" className="underline">Back to your account</Link>
        </p>
      </header>
      {notice ? <p role="status" className="rounded border border-green-600 p-3 text-sm">{notice}</p> : null}
      {error ? <p role="alert" className="rounded border border-red-600 p-3 text-sm">{error}</p> : null}
      {rows.length === 0 ? <p>You haven’t submitted an event yet.</p> : null}
      <ul className="flex flex-col gap-4">
        {rows.map((row) => (
          <li key={row.id} data-testid="own-event" className="flex flex-col gap-1 border border-rule p-4 text-sm">
            <p className="font-semibold">
              {row.status === "published" || row.status === "cancelled" ? (
                <Link href={`/events/${row.slug}`} className="underline">{row.title}</Link>
              ) : (
                row.title
              )}
            </p>
            <p>{EVENT_TYPE_LABELS[row.event_type]} · {formatInZone(row.starts_at, row.tz)}</p>
            <p>Status: <strong>{STATUS[row.status]}</strong></p>
            {row.status === "rejected" && row.reject_reason ? <p>Editor’s note: {row.reject_reason}</p> : null}
            {row.status === "pending" || row.status === "rejected" ? (
              <p><Link href={`/account/events/${row.id}`} className="underline">Edit and resubmit</Link></p>
            ) : null}
          </li>
        ))}
      </ul>
    </main>
  );
}
