import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { TurnstileWidget } from "@/app/(public)/write-for-us/turnstile-widget";
import { EMPTY_EVENT_FIELDS, EventFields } from "@/components/events/event-fields";
import { EventsFrame } from "@/components/events/events-frame";
import { loginPath } from "@/lib/auth/access";
import { getSession } from "@/lib/auth/session";
import { EVENT_FORM_ERRORS } from "@/lib/events/messages";
import { timeZoneOptions } from "@/lib/events/time";

import { submitEvent } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Add an event",
  alternates: { canonical: "/events/submit" },
  robots: { index: false },
};

const field = "rounded border border-rule bg-paper px-3 py-2 text-base";

export default async function SubmitEventPage({ searchParams }: PageProps<"/events/submit">) {
  const { user } = await getSession();
  if (!user) redirect(loginPath("/events/submit"));
  const params = await searchParams;
  const error = typeof params.error === "string" ? EVENT_FORM_ERRORS[params.error] : undefined;
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  return (
    <EventsFrame>
      <h1 className="font-serif text-4xl font-bold">Add an event</h1>
      <p className="max-w-2xl">
        Tell us about a retreat, conference, webinar, circle or training. An editor checks every event before it appears, and you can follow it under{" "}
        <Link href="/account/events" className="underline">Your events</Link>. We don’t sell placement from this form.
      </p>
      {error ? <p role="alert" className="rounded border border-red-600 p-3 text-sm">{error}</p> : null}
      <form action={submitEvent} className="grid max-w-xl gap-3">
        <EventFields values={EMPTY_EVENT_FIELDS} zones={timeZoneOptions()} />
        <label className="flex flex-col gap-1 text-sm">
          Description
          <textarea name="description" maxLength={4000} rows={6} className={field} />
          <span className="text-xs text-muted">Plain text. Leave a blank line between paragraphs. No medical claims, please.</span>
        </label>
        <p className="text-xs text-muted">We keep your account email to contact you about this event. It is never published.</p>
        {siteKey ? <TurnstileWidget siteKey={siteKey} action="event_submit" /> : <p className="text-sm">Event submissions are closed right now.</p>}
        <button type="submit" disabled={!siteKey} className="self-start rounded bg-ink px-4 py-2 text-paper disabled:opacity-50">
          Submit event
        </button>
      </form>
    </EventsFrame>
  );
}
