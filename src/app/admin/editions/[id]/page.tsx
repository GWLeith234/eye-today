import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { requireArea } from "@/lib/auth/session";
import { EDITION_COLUMNS, type EditionRow, editorItems } from "@/lib/editions/admin";
import { earlyAccessDays, issueLabel } from "@/lib/editions/model";

import { coverChoices, storyChoices } from "../choices";
import { EditionForm } from "../edition-form";

const local = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 16) : "");

// The stored letter is <p>…</p> HTML built from plain text; undo that for the textarea.
function letterText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

export default async function EditionAdminPage({ params, searchParams }: PageProps<"/admin/editions/[id]">) {
  const { supabase } = await requireArea("admin");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const query = await searchParams;
  const { data: edition } = await supabase.from("editions").select(EDITION_COLUMNS).eq("id", id).maybeSingle<EditionRow>();
  if (!edition) notFound();
  const items = await editorItems(supabase, id);
  const ids = items.map((item) => item.article.id);
  const [stories, covers] = await Promise.all([storyChoices(supabase, ids), coverChoices(supabase, edition.cover_media_id)]);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm"><Link href="/admin/editions" className="underline">← All editions</Link></p>
      <h1 className="text-2xl font-semibold">{edition.title}</h1>
      <p className="text-sm text-muted">
        {issueLabel(edition.issue_month)} · <Link href={`/editions/${edition.slug}`} className="underline">/editions/{edition.slug}</Link>
        {edition.pdf_path ? <> · <a href={`/editions/${edition.slug}/pdf`} className="underline">Download PDF</a></> : null}
      </p>
      <EditionForm
        values={{
          id: edition.id,
          title: edition.title,
          issue_month: edition.issue_month.slice(0, 7),
          slug: edition.slug,
          cover_media_id: edition.cover_media_id ?? "",
          letter: letterText(edition.letter_html),
          status: edition.status,
          public_from: local(edition.public_from),
          early_days: earlyAccessDays(edition.supporters_from, edition.public_from),
          story_ids: ids,
          pdf_generated_at: edition.pdf_generated_at,
        }}
        stories={stories}
        covers={covers}
        notice={query.saved ? "Edition saved." : undefined}
      />
    </div>
  );
}
