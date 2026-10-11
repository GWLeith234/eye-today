import type { Metadata } from "next";
import Link from "next/link";

import { issueLabel } from "@/lib/editions/model";
import { listEditions } from "@/lib/editions/public";
import { mediaUrl } from "@/lib/media/url";
import { SupportNote } from "@/components/public/support-note";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Editions",
  description: "Eye Today’s monthly e-edition: a designed issue of the month’s stories, readable online or as a PDF.",
  alternates: { canonical: "/editions" },
};

export default async function EditionsPage() {
  const editions = await listEditions();
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <h1 className="font-serif text-4xl font-bold">Editions</h1>
      <p>Each month we gather the stories that mattered into one issue. Read it page by page here, or download the PDF.</p>
      {editions.length === 0 ? <p role="status">The first edition is on its way.</p> : null}
      <ul className="grid gap-6 sm:grid-cols-2">
        {editions.map((edition) => (
          <li key={edition.slug} className="flex flex-col gap-2 border-t border-rule pt-4">
            <Link href={`/editions/${edition.slug}`} className="group flex flex-col gap-2">
              {edition.cover_storage_path ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mediaUrl(edition.cover_storage_path, { width: 800 })} alt={edition.cover_alt ?? ""} className="aspect-[3/4] w-full object-cover" loading="lazy" />
              ) : (
                <div aria-hidden className="flex aspect-[3/4] w-full items-end bg-ink p-4 font-serif text-3xl font-bold text-paper">{issueLabel(edition.issue_month)}</div>
              )}
              <p className="text-xs font-semibold uppercase tracking-widest">
                {issueLabel(edition.issue_month)}
                {edition.access === "early" ? " · Early access" : ""}
              </p>
              <h2 className="font-serif text-xl font-semibold group-hover:underline">{edition.title}</h2>
              <p className="text-sm text-muted">{edition.story_count} {edition.story_count === 1 ? "story" : "stories"}</p>
            </Link>
          </li>
        ))}
      </ul>
      <SupportNote />
    </div>
  );
}
