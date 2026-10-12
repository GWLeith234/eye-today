import type { Metadata } from "next";
import Link from "next/link";

import { TopAds } from "@/components/public/page-ads";
import { SupportNote } from "@/components/public/support-note";
import { readSources } from "@/lib/directory/sources";
import { dateLabel } from "@/lib/newsroom/model";
import { MEDICAL_DISCLAIMER } from "@/lib/public/disclaimer";
import { isTrackerKind, nextKeyDate, readKeyDates, TRACKER_KIND_LABELS, TRACKER_KINDS, type TrackerEntry, type TrackerKind } from "@/lib/tracker/model";
import { trackerEntries } from "@/lib/tracker/public";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Trials & Funding Tracker",
  description: "Ibogaine clinical trials, public funding programmes and regulatory actions in one place, with dates, sources and our reporting on each.",
  alternates: { canonical: "/tracker" },
};

function EntryRow({ entry, today }: { entry: TrackerEntry; today: string }) {
  const dates = readKeyDates(entry.key_dates);
  const next = nextKeyDate(dates, today);
  const links = readSources(entry.links);
  const facts = [entry.sponsor, entry.stage, entry.amount, entry.jurisdiction].filter(Boolean);
  return (
    <article data-tracker-entry={entry.slug} className="flex flex-col gap-2 border-t border-rule py-4">
      <h3 className="font-serif text-xl font-semibold">{entry.title}</h3>
      {facts.length > 0 ? <p className="text-sm">{facts.join(" · ")}</p> : null}
      {entry.notes ? <p className="text-sm">{entry.notes}</p> : null}
      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
        {next ? (
          <div className="flex gap-1">
            <dt className="font-semibold">{next.label}:</dt>
            <dd><time dateTime={next.date}>{dateLabel(next.date)}</time></dd>
          </div>
        ) : null}
        {entry.last_reviewed ? (
          <div className="flex gap-1">
            <dt className="font-semibold">Last reviewed:</dt>
            <dd><time dateTime={entry.last_reviewed}>{dateLabel(entry.last_reviewed)}</time></dd>
          </div>
        ) : null}
      </dl>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {entry.article_slug && entry.article_section ? (
          <Link href={`/${entry.article_section}/${entry.article_slug}`} className="font-semibold underline">Our story: {entry.article_title}</Link>
        ) : null}
        {links.map((link) => (
          <a key={link.url} href={link.url} rel="noopener noreferrer" target="_blank" className="underline">{link.title} ↗</a>
        ))}
      </p>
    </article>
  );
}

export default async function TrackerPage({ searchParams }: PageProps<"/tracker">) {
  const params = await searchParams;
  const kind: TrackerKind | null = isTrackerKind(params.kind) ? params.kind : null;
  const entries = await trackerEntries(kind);
  const today = new Date().toISOString().slice(0, 10);
  const groups = TRACKER_KINDS.map((k) => ({ kind: k, rows: entries.filter((e) => e.kind === k) })).filter((g) => g.rows.length > 0);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted">Eye Today tracker</p>
        <h1 className="font-serif text-4xl font-bold">Trials &amp; Funding Tracker</h1>
        <p>
          Every ibogaine trial, funding programme and regulatory action we are following, with the dates that matter and a link to the primary source. Where we
          have reported on an entry, our story is linked. Updated by the newsroom; each entry shows when it was last reviewed.
        </p>
      </header>
      <TopAds page="other" />

      <nav aria-label="Filter" className="flex flex-wrap gap-2 text-sm">
        <Link href="/tracker" aria-current={kind === null ? "page" : undefined} className={`rounded border border-rule px-3 py-1 ${kind === null ? "bg-ink text-paper" : "hover:underline"}`}>All</Link>
        {TRACKER_KINDS.map((k) => (
          <Link key={k} href={`/tracker?kind=${k}`} aria-current={kind === k ? "page" : undefined} className={`rounded border border-rule px-3 py-1 ${kind === k ? "bg-ink text-paper" : "hover:underline"}`}>
            {TRACKER_KIND_LABELS[k]}
          </Link>
        ))}
      </nav>

      {entries.length === 0 ? <p role="status">Nothing tracked here yet.</p> : null}

      {groups.map((group) => (
        <section key={group.kind} aria-labelledby={`tracker-${group.kind}`} className="flex flex-col gap-2 border-t-2 border-ink pt-4">
          <h2 id={`tracker-${group.kind}`} className="font-display text-2xl font-semibold">{TRACKER_KIND_LABELS[group.kind]}</h2>
          {group.rows.map((entry) => (
            <EntryRow key={entry.id} entry={entry} today={today} />
          ))}
        </section>
      ))}

      <p className="text-xs text-muted">{MEDICAL_DISCLAIMER} Missing something? <a href="mailto:newsroom@theeye.today" className="underline">newsroom@theeye.today</a>.</p>
      <SupportNote />
    </div>
  );
}
