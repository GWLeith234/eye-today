import Link from "next/link";

import { EMPTY_EVENT_FIELDS } from "@/components/events/event-fields";
import { requireArea } from "@/lib/auth/session";
import { timeZoneOptions } from "@/lib/events/time";

import { EventEditorForm } from "../event-form";

export default async function NewEventPage() {
  const { supabase } = await requireArea("admin");
  const { data: media } = await supabase
    .from("media")
    .select("id, storage_path, alt")
    .order("created_at", { ascending: false })
    .limit(100)
    .returns<{ id: string; storage_path: string; alt: string | null }[]>();

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm"><Link href="/admin/events" className="underline">← All events</Link></p>
      <h1 className="text-2xl font-semibold">New event</h1>
      <p className="text-sm">Saved as a draft. Publish it from the event page.</p>
      <EventEditorForm
        id=""
        slug=""
        values={EMPTY_EVENT_FIELDS}
        html=""
        imageMediaId=""
        editorNote=""
        promotedUntil=""
        media={media ?? []}
        zones={timeZoneOptions()}
      />
    </div>
  );
}
