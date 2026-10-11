import Link from "next/link";

import { requireArea } from "@/lib/auth/session";

import { coverChoices, storyChoices } from "../choices";
import { EditionForm } from "../edition-form";

export default async function NewEditionPage() {
  const { supabase } = await requireArea("admin");
  const [stories, covers] = await Promise.all([storyChoices(supabase, []), coverChoices(supabase)]);
  const now = new Date();
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm"><Link href="/admin/editions" className="underline">← All editions</Link></p>
      <h1 className="text-2xl font-semibold">New edition</h1>
      <EditionForm
        values={{ id: "", title: "", issue_month: month, slug: "", cover_media_id: "", letter: "", status: "draft", public_from: "", early_days: 0, story_ids: [], pdf_generated_at: null }}
        stories={stories}
        covers={covers}
      />
    </div>
  );
}
