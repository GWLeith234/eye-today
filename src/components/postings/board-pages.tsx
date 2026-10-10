import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { sanitizeArticleHtml } from "@/lib/editor/sanitize";
import { jobPostingJsonLd, postingSummary } from "@/lib/postings/jsonld";
import { countPostings, getPosting, listPostings } from "@/lib/postings/public";
import { parsePostingFilters, postingsHref, salaryText } from "@/lib/postings/query";
import {
  BOARD,
  CATEGORY_LABELS,
  CLASSIFIED_CATEGORIES,
  EMPLOYMENT_LABELS,
  EMPLOYMENT_TYPES,
  type PostingKind,
  REMOTE_LABELS,
  REMOTE_OPTIONS,
} from "@/lib/postings/types";
import { absoluteUrl } from "@/lib/public/site";
import { SLUG_RE } from "@/lib/slug";

import { BoardFrame, PostingCardView, postingPlace, postingTypeLabel } from "./posting-list";

const field = "rounded border border-rule bg-paper px-3 py-2 text-sm";

const INTRO: Record<PostingKind, string> = {
  job: "Roles at clinics, research groups, harm-reduction services and others working in the field. Every posting is read by an editor before it appears.",
  classified: "Training, services and programmes for practitioners. No substances are sold or offered here. Every posting is read by an editor before it appears.",
};

export async function BoardList({ kind, searchParams }: { kind: PostingKind; searchParams: Record<string, string | string[] | undefined> }) {
  const filters = parsePostingFilters(kind, searchParams);
  const [postings, total] = await Promise.all([listPostings(kind, filters), countPostings(kind, filters)]);
  const pages = Math.max(1, Math.ceil(total / 24));
  const types = kind === "job" ? EMPLOYMENT_TYPES.map((t) => [t, EMPLOYMENT_LABELS[t]] as const) : CLASSIFIED_CATEGORIES.map((c) => [c, CATEGORY_LABELS[c]] as const);
  const board = BOARD[kind];

  return (
    <BoardFrame>
      <h1 className="font-serif text-4xl font-bold">{board.title}</h1>
      <p className="max-w-2xl">{INTRO[kind]}</p>
      <p className="text-sm">
        <Link href={`/account/postings/new?kind=${kind}`} className="rounded bg-ink px-3 py-1.5 text-paper">Post a {board.singular}</Link>
      </p>
      <form method="get" action={board.path} className="flex flex-wrap items-end gap-3" aria-label={`Filter ${board.title.toLowerCase()}`}>
        <label className="flex flex-col gap-1 text-sm">
          {kind === "job" ? "Type" : "Category"}
          <select name="type" defaultValue={filters.type} className={field}>
            <option value="">All</option>
            {types.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Country code
          <input name="country" maxLength={2} placeholder="ZA" defaultValue={filters.country} className={`${field} w-24 uppercase`} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Where
          <select name="remote" defaultValue={filters.remote} className={field}>
            <option value="">Anywhere</option>
            {REMOTE_OPTIONS.map((option) => (
              <option key={option} value={option}>{REMOTE_LABELS[option]}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="rounded bg-ink px-4 py-2 text-sm text-paper">Show</button>
      </form>
      {postings.length === 0 ? (
        <p role="status">Nothing matches right now.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {postings.map((posting) => (
            <li key={posting.id}>
              <PostingCardView kind={kind} posting={posting} />
            </li>
          ))}
        </ul>
      )}
      {pages > 1 ? (
        <nav aria-label="Pages" className="flex gap-4 text-sm">
          {filters.page > 1 ? <Link href={postingsHref(kind, filters, filters.page - 1)} className="underline">Previous</Link> : null}
          <span>Page {filters.page} of {pages}</span>
          {filters.page < pages ? <Link href={postingsHref(kind, filters, filters.page + 1)} className="underline">Next</Link> : null}
        </nav>
      ) : null}
    </BoardFrame>
  );
}

async function load(kind: PostingKind, slug: string) {
  if (!SLUG_RE.test(slug)) return null;
  return getPosting(kind, slug);
}

export async function postingMetadata(kind: PostingKind, slug: string): Promise<Metadata> {
  const posting = await load(kind, slug);
  if (!posting) return {};
  const canonical = `${BOARD[kind].path}/${posting.slug}`;
  const description = postingSummary(posting) || `${posting.title} at ${posting.organisation}.`;
  return { title: `${posting.title}, ${posting.organisation}`, description, alternates: { canonical }, openGraph: { title: posting.title, description, url: canonical } };
}

export async function BoardDetail({ kind, slug }: { kind: PostingKind; slug: string }) {
  const posting = await load(kind, slug);
  if (!posting) notFound();
  const canonical = `${BOARD[kind].path}/${posting.slug}`;
  const pageUrl = absoluteUrl(canonical);
  const pay = salaryText(posting);
  const closes = posting.closing_date
    ? new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${posting.closing_date}T12:00:00Z`))
    : null;

  return (
    <BoardFrame>
      {kind === "job" ? (
        <script
          type="application/ld+json"
          data-testid="job-posting-jsonld"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jobPostingJsonLd(posting, { pageUrl: pageUrl.startsWith("http") ? pageUrl : null })).replace(/</g, "\\u003c") }}
        />
      ) : null}
      <article className="flex flex-col gap-4">
        <p className="text-xs font-semibold uppercase tracking-widest">
          <Link href={`${BOARD[kind].path}?type=${posting.employment_type ?? posting.category}`} className="hover:underline">{postingTypeLabel(posting)}</Link>
        </p>
        <h1 className="font-serif text-4xl font-bold">{posting.title}</h1>
        <dl className="grid gap-2 text-sm sm:grid-cols-[10rem_1fr]">
          <dt className="font-semibold">{kind === "job" ? "Organisation" : "Offered by"}</dt>
          <dd>
            {posting.listing_slug && posting.listing_name ? (
              <Link href={`/directory/listing/${posting.listing_slug}`} className="text-accent underline">{posting.organisation}</Link>
            ) : (
              posting.organisation
            )}
          </dd>
          <dt className="font-semibold">Where</dt>
          <dd>{postingPlace(posting)}</dd>
          {pay ? (
            <>
              <dt className="font-semibold">Pay</dt>
              <dd>{pay}</dd>
            </>
          ) : null}
          {closes ? (
            <>
              <dt className="font-semibold">Closes</dt>
              <dd>{closes}</dd>
            </>
          ) : null}
        </dl>
        <div className="article-body flex max-w-2xl flex-col gap-4" dangerouslySetInnerHTML={{ __html: sanitizeArticleHtml(posting.description_html) }} />
        <p className="flex flex-wrap gap-3 text-sm">
          {posting.apply_url ? (
            <a href={posting.apply_url} rel="noopener noreferrer nofollow" target="_blank" className="rounded bg-ink px-4 py-2 text-paper">
              {kind === "job" ? "Apply with the employer" : "Find out more"}
            </a>
          ) : null}
          {posting.apply_email ? (
            <a href={`mailto:${posting.apply_email}`} className="rounded border border-rule px-4 py-2">Email {posting.apply_email}</a>
          ) : null}
        </p>
        <p className="text-xs text-muted">
          Posted by the advertiser and checked by an editor. Eye Today doesn’t take part in hiring or in the services offered.{" "}
          <Link href="/jobs/policy" className="underline">Posting policy</Link>
        </p>
      </article>
    </BoardFrame>
  );
}
