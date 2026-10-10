import Link from "next/link";

import { countryName } from "@/lib/directory/countries";
import { salaryText } from "@/lib/postings/query";
import {
  BOARD,
  CATEGORY_LABELS,
  EMPLOYMENT_LABELS,
  type JobSummary,
  type PostingCard,
  type PostingKind,
  REMOTE_LABELS,
} from "@/lib/postings/types";
import { MEDICAL_DISCLAIMER } from "@/lib/public/disclaimer";

export function BoardFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      <nav aria-label="Jobs and classifieds" className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
        <Link href="/jobs" className="font-semibold hover:underline">Jobs</Link>
        <Link href="/classifieds" className="hover:underline">Classifieds</Link>
        <Link href="/account/postings/new" className="hover:underline">Post a listing</Link>
        <Link href="/jobs/policy" className="hover:underline">Posting policy</Link>
      </nav>
      {children}
      <p role="note" className="border-l-4 border-accent bg-white/60 p-3 text-sm font-semibold">
        {MEDICAL_DISCLAIMER}{" "}
        <Link href="/disclaimer" className="underline">Read the disclaimer</Link>
      </p>
    </div>
  );
}

export function postingPlace(p: { location: string | null; country_code: string | null; remote: keyof typeof REMOTE_LABELS }): string {
  const where = [p.location, p.country_code ? countryName(p.country_code) : null].filter(Boolean).join(", ");
  if (p.remote === "remote") return where ? `Remote (${where})` : "Remote";
  if (p.remote === "hybrid") return where ? `Hybrid, ${where}` : "Hybrid";
  return where;
}

export function postingTypeLabel(p: { employment_type: string | null; category: string | null }): string {
  if (p.employment_type) return EMPLOYMENT_LABELS[p.employment_type as keyof typeof EMPLOYMENT_LABELS] ?? "";
  if (p.category) return CATEGORY_LABELS[p.category as keyof typeof CATEGORY_LABELS] ?? "";
  return "";
}

export function PostingCardView({ kind, posting }: { kind: PostingKind; posting: PostingCard }) {
  const pay = salaryText(posting);
  return (
    <article className="flex flex-col gap-1 border-t border-rule pt-4">
      <p className="text-xs font-semibold uppercase tracking-widest">{postingTypeLabel(posting)}</p>
      <h3 className="font-serif text-xl font-semibold">
        <Link href={`${BOARD[kind].path}/${posting.slug}`} className="hover:underline">{posting.title}</Link>
      </h3>
      <p className="text-sm">{posting.organisation} · {postingPlace(posting)}</p>
      {pay ? <p className="text-sm text-muted">{pay}</p> : null}
    </article>
  );
}

export function LatestJobs({ jobs, id = "latest-jobs", heading = "Latest jobs" }: { jobs: JobSummary[]; id?: string; heading?: string }) {
  if (jobs.length === 0) return null;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3 border-t-2 border-ink pt-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={id} className="font-display text-2xl font-semibold">{heading}</h2>
        <Link href="/jobs" className="text-sm underline">All jobs</Link>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {jobs.map((job) => (
          <li key={job.id} className="flex flex-col gap-1">
            <p className="text-xs font-semibold uppercase tracking-widest">{postingTypeLabel({ employment_type: job.employment_type, category: null })}</p>
            <Link href={`/jobs/${job.slug}`} className="font-serif text-lg font-semibold hover:underline">{job.title}</Link>
            <p className="text-sm">{job.organisation}</p>
            <p className="text-sm text-muted">{postingPlace({ location: job.location, country_code: null, remote: job.remote })}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
