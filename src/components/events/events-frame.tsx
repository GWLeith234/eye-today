import Link from "next/link";

import { SideAds, TopAds } from "@/components/public/page-ads";
import type { PageType } from "@/lib/ads/slots";
import { MEDICAL_DISCLAIMER } from "@/lib/public/disclaimer";

export function EventsFrame({ children, ads = "events" }: { children: React.ReactNode; ads?: PageType }) {
  return (
    <div className="mx-auto flex w-full max-w-page flex-col gap-6 px-4 py-8">
      <nav aria-label="Events" className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
        <Link href="/events" className="font-semibold hover:underline">Events</Link>
        <Link href="/events?view=calendar" className="hover:underline">Calendar</Link>
        <Link href="/events/submit" className="hover:underline">Add an event</Link>
        <a href="/events.ics" className="hover:underline">Subscribe (.ics)</a>
      </nav>
      <TopAds page={ads} />
      {/* The rail beside the content on desktop, the same grammar as the cover and the section
          fronts. Before this it was a lone 300px box stranded at the foot of the page. */}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-6">
        <div className="flex min-w-0 flex-col gap-6">{children}</div>
        <SideAds page={ads} className="mx-auto flex w-full max-w-[300px] flex-col gap-6 lg:mx-0" />
      </div>
      <p role="note" className="border-l-4 border-accent bg-white/60 p-3 text-sm font-semibold">
        {MEDICAL_DISCLAIMER}{" "}
        <Link href="/disclaimer" className="underline">Read the disclaimer</Link>
      </p>
    </div>
  );
}
