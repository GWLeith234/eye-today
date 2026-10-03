import { format } from "date-fns";
import type { Metadata } from "next";
import Link from "next/link";

import { Pagination } from "@/components/public/pagination";
import { type SearchResult, articleHref, getSections, searchArticles, searchCount } from "@/lib/public/data";
import { parsePage } from "@/lib/public/paging";
import { isReservedSectionSlug } from "@/lib/public/reserved";

export const metadata: Metadata = { title: "Search", robots: { index: false, follow: true } };

// The database marks matches with « and ». Split on them and let React escape
// every piece, so the only markup in a snippet is the <mark> added here.
function Snippet({ text }: { text: string }) {
  const parts = text.split(/(«[^«»]*»)/);
  return (
    <p className="text-sm text-muted">
      {parts.map((part, index) =>
        part.startsWith("«") && part.endsWith("»") ? (
          <mark key={index} className="bg-accent/15 px-0.5 text-ink">
            {part.slice(1, -1)}
          </mark>
        ) : (
          part.replace(/[«»]/g, "")
        ),
      )}
    </p>
  );
}

function Result({ result }: { result: SearchResult }) {
  return (
    <li className="flex flex-col gap-1 border-t border-rule pt-4">
      <p className="text-xs font-semibold uppercase tracking-widest">
        {result.is_sponsored ? <span className="mr-2 bg-ink px-1 py-0.5 text-paper">Sponsored</span> : null}
        <span className="text-brand">{result.section_name}</span>
      </p>
      <h2 className="font-display text-xl font-bold leading-snug">
        <Link href={articleHref(result)} className="hover:underline">{result.title}</Link>
      </h2>
      {result.snippet ? <Snippet text={result.snippet} /> : null}
      {result.published_at ? (
        <p className="text-xs text-muted">
          <time dateTime={result.published_at}>{format(new Date(result.published_at), "d MMM yyyy")}</time>
        </p>
      ) : null}
    </li>
  );
}

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const params = await searchParams;
  const q = (typeof params.q === "string" ? params.q : "").trim().slice(0, 80);
  const sections = (await getSections()).filter((s) => !isReservedSectionSlug(s.slug));
  const requested = typeof params.section === "string" ? params.section : "";
  const section = sections.find((s) => s.slug === requested) ?? null;
  const page = parsePage(params.page);

  const [results, total] = q
    ? await Promise.all([searchArticles(q, section?.slug ?? null, page), searchCount(q, section?.slug ?? null)])
    : [[], 0];
  const query = new URLSearchParams({ q, ...(section ? { section: section.slug } : {}) });

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
      <h1 className="font-display text-4xl font-bold">Search</h1>
      <form role="search" action="/search" className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm font-semibold">
          Search Eye Today
          <input type="search" name="q" defaultValue={q} maxLength={80} className="rounded border border-ink bg-white px-3 py-2 text-base font-normal" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Section
          <select name="section" defaultValue={section?.slug ?? ""} className="rounded border border-ink bg-white px-3 py-2 text-base font-normal">
            <option value="">All sections</option>
            {sections.map((s) => (
              <option key={s.id} value={s.slug}>{s.name}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="rounded bg-ink px-4 py-2 text-paper">Search</button>
      </form>
      {q ? (
        <>
          <p className="text-sm text-muted" role="status">
            {total === 0
              ? `No stories match “${q}”${section ? ` in ${section.name}` : ""}.`
              : `${total} ${total === 1 ? "story" : "stories"} for “${q}”${section ? ` in ${section.name}` : ""}.`}
          </p>
          <ol className="flex flex-col gap-6">
            {results.map((result) => (
              <Result key={`${result.section_slug}/${result.article_slug}`} result={result} />
            ))}
          </ol>
          <Pagination basePath={`/search?${query.toString()}`} page={page} total={total} />
        </>
      ) : null}
    </div>
  );
}
