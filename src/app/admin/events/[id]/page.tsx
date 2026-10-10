import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { requireArea } from "@/lib/auth/session";
import { instantToWallTime, timeZoneOptions } from "@/lib/events/time";

import { reviewEvent } from "../actions";
import { EventEditorForm } from "../event-form";

const ERRORS: Record<string, string> = {
  reason: "A rejection needs a reason the organiser will see.",
  not_published: "Only a published event can be cancelled.",
  save_failed: "The change could not be saved.",
};

const DONE: Record<string, string> = {
  "1": "Event saved.",
  approve: "Event published.",
  reject: "Event rejected.",
  cancel: "Event cancelled. Its page stays up with a Cancelled banner.",
  unpublish: "Event moved back to draft.",
};

type Row = {
  id: string;
  slug: string;
  title: string;
  event_type: string;
  attendance: string;
  starts_at: string;
  ends_at: string;
  tz: string;
  venue: string | null;
  country_code: string | null;
  city: string | null;
  organiser_name: string;
  price_note: string;
  registration_url: string | null;
  image_media_id: string | null;
  description_html: string;
  listing_id: string | null;
  status: string;
  reject_reason: string | null;
  promoted_until: string | null;
};

export default async function EventAdminPage({ params, searchParams }: PageProps<"/admin/events/[id]">) {
  const { supabase } = await requireArea("admin");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const query = await searchParams;

  const [rowResult, noteResult, media] = await Promise.all([
    supabase
      .from("events")
      .select(
        "id, slug, title, event_type, attendance, starts_at, ends_at, tz, venue, country_code, city, organiser_name, price_note, registration_url, image_media_id, description_html, listing_id, status, reject_reason, promoted_until",
      )
      .eq("id", id)
      .maybeSingle<Row>(),
    supabase.rpc("event_editor_note", { p_id: id }),
    supabase.from("media").select("id, storage_path, alt").order("created_at", { ascending: false }).limit(100).returns<{ id: string; storage_path: string; alt: string | null }[]>(),
  ]);
  const row = rowResult.data;
  if (!row) notFound();

  const { data: listing } = row.listing_id
    ? await supabase.from("directory_listings").select("slug").eq("id", row.listing_id).maybeSingle<{ slug: string }>()
    : { data: null };

  const start = instantToWallTime(row.starts_at, row.tz);
  const end = instantToWallTime(row.ends_at, row.tz);
  const error = typeof query.error === "string" ? ERRORS[query.error] : undefined;
  const notice = typeof query.saved === "string" ? DONE[query.saved] : undefined;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm"><Link href="/admin/events" className="underline">← All events</Link></p>
      <h1 className="text-2xl font-semibold">{row.title}</h1>
      <p className="text-sm">
        Status: <strong>{row.status}</strong>
        {row.status === "published" || row.status === "cancelled" ? (
          <> · <Link href={`/events/${row.slug}`} className="underline">View page</Link></>
        ) : null}
      </p>
      {row.reject_reason ? <p className="text-sm">Rejected: {row.reject_reason}</p> : null}
      {error ? <p role="alert" className="rounded border border-red-600 p-2 text-sm">{error}</p> : null}

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {row.status !== "published" && row.status !== "cancelled" ? (
          <form action={reviewEvent}>
            <input type="hidden" name="id" value={row.id} />
            <input type="hidden" name="back" value="detail" />
            <input type="hidden" name="action" value="approve" />
            <button type="submit" className="rounded bg-ink px-3 py-1 text-paper">Approve and publish</button>
          </form>
        ) : null}
        {row.status === "pending" || row.status === "draft" ? (
          <form action={reviewEvent} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="id" value={row.id} />
            <input type="hidden" name="back" value="detail" />
            <input type="hidden" name="action" value="reject" />
            <input name="reason" required maxLength={500} aria-label="Reason for rejecting" placeholder="Reason (the organiser sees this)" className="rounded border border-rule bg-paper px-2 py-1" />
            <button type="submit" className="rounded border border-rule px-3 py-1">Reject</button>
          </form>
        ) : null}
        {row.status === "published" ? (
          <>
            <form action={reviewEvent}>
              <input type="hidden" name="id" value={row.id} />
              <input type="hidden" name="back" value="detail" />
              <input type="hidden" name="action" value="cancel" />
              <button type="submit" className="rounded border border-rule px-3 py-1">Mark cancelled</button>
            </form>
            <form action={reviewEvent}>
              <input type="hidden" name="id" value={row.id} />
              <input type="hidden" name="back" value="detail" />
              <input type="hidden" name="action" value="unpublish" />
              <button type="submit" className="rounded border border-rule px-3 py-1">Unpublish</button>
            </form>
          </>
        ) : null}
      </div>

      <EventEditorForm
        id={row.id}
        slug={row.slug}
        values={{
          title: row.title,
          event_type: row.event_type,
          attendance: row.attendance,
          start_date: start.date,
          start_time: start.time,
          end_date: end.date,
          end_time: end.time,
          tz: row.tz,
          venue: row.venue ?? "",
          country: row.country_code ?? "",
          city: row.city ?? "",
          organiser_name: row.organiser_name,
          price_note: row.price_note,
          registration_url: row.registration_url ?? "",
          listing_slug: listing?.slug ?? "",
        }}
        html={row.description_html}
        imageMediaId={row.image_media_id ?? ""}
        editorNote={typeof noteResult.data === "string" ? noteResult.data : ""}
        promotedUntil={row.promoted_until ? row.promoted_until.slice(0, 10) : ""}
        media={media.data ?? []}
        zones={timeZoneOptions()}
        notice={notice}
      />
    </div>
  );
}
