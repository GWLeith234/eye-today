import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { resubmitEvent } from "@/app/(public)/events/submit/actions";
import { EventFields } from "@/components/events/event-fields";
import { requireArea } from "@/lib/auth/session";
import { htmlToText } from "@/lib/events/ics";
import { EVENT_FORM_ERRORS } from "@/lib/events/messages";
import { instantToWallTime, timeZoneOptions } from "@/lib/events/time";

export const dynamic = "force-dynamic";

const field = "rounded border border-rule bg-paper px-3 py-2 text-base";

type Row = {
  id: string;
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
  description_html: string;
  listing_id: string | null;
  status: string;
  reject_reason: string | null;
};

export default async function ResubmitEventPage({ params, searchParams }: PageProps<"/account/events/[id]">) {
  const { supabase, user } = await requireArea("account");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const query = await searchParams;
  const error = typeof query.error === "string" ? EVENT_FORM_ERRORS[query.error] : undefined;

  const { data: row } = await supabase
    .from("events")
    .select("id, title, event_type, attendance, starts_at, ends_at, tz, venue, country_code, city, organiser_name, price_note, registration_url, description_html, listing_id, status, reject_reason")
    .eq("id", id)
    .eq("organiser_id", user.id)
    .in("status", ["pending", "rejected"])
    .maybeSingle<Row>();
  if (!row) notFound();

  // Readers can see published listings; an unpublished one comes back empty and the field starts blank.
  const { data: listing } = row.listing_id
    ? await supabase.from("directory_listings").select("slug").eq("id", row.listing_id).maybeSingle<{ slug: string }>()
    : { data: null };
  const start = instantToWallTime(row.starts_at, row.tz);
  const end = instantToWallTime(row.ends_at, row.tz);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold">Edit and resubmit</h1>
        <p className="text-sm text-muted"><Link href="/account/events" className="underline">Back to your events</Link></p>
      </header>
      {row.status === "rejected" && row.reject_reason ? <p className="border border-rule p-3 text-sm">Editor’s note: {row.reject_reason}</p> : null}
      {error ? <p role="alert" className="rounded border border-red-600 p-3 text-sm">{error}</p> : null}
      <form action={resubmitEvent} className="grid max-w-xl gap-3">
        <input type="hidden" name="id" value={row.id} />
        <EventFields
          zones={timeZoneOptions()}
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
        />
        <label className="flex flex-col gap-1 text-sm">
          Description
          <textarea name="description" maxLength={4000} rows={6} defaultValue={htmlToText(row.description_html)} className={field} />
        </label>
        <button type="submit" className="self-start rounded bg-ink px-4 py-2 text-paper">Resubmit for review</button>
      </form>
    </main>
  );
}
