import Link from "next/link";

import { requireArea } from "@/lib/auth/session";

import { storyChoices } from "../choices";
import { EntryForm } from "../entry-form";

export default async function NewTrackerEntryPage() {
  const { supabase } = await requireArea("admin");
  const stories = await storyChoices(supabase, null);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm"><Link href="/admin/tracker" className="underline">← Tracker</Link></p>
      <h1 className="text-2xl font-semibold">New tracker entry</h1>
      <EntryForm
        values={{ id: "", kind: "trial", title: "", slug: "", sponsor: "", stage: "", amount: "", jurisdiction: "", key_dates: "", links: "", notes: "", article_id: "", last_reviewed: today, status: "draft", sort: 0 }}
        stories={stories}
      />
    </div>
  );
}
