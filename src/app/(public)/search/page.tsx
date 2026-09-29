import type { Metadata } from "next";

import { StoryList } from "@/components/public/story-card";
import type { ArticleCard } from "@/lib/public/data";
import { createAnonClient } from "@/lib/supabase/anon";

export const metadata: Metadata = { title: "Search" };

type Row = {
  title: string;
  dek: string | null;
  slug: string;
  status: string;
  published_at: string | null;
  scheduled_for: string | null;
  is_sponsored: boolean;
  sections: { slug: string; name: string } | null;
};

async function search(q: string): Promise<ArticleCard[]> {
  const supabase = createAnonClient();
  if (!supabase) return [];
  // Anon client + RLS: only published and due scheduled articles can match.
  const { data } = await supabase
    .from("articles")
    .select("title, dek, slug, status, published_at, scheduled_for, is_sponsored, sections(slug, name)")
    .textSearch("search", q, { config: "english", type: "websearch" })
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(20)
    .returns<Row[]>();
  return (data ?? [])
    .filter((row) => row.sections)
    .map((row) => ({
      title: row.title,
      dek: row.dek,
      article_slug: row.slug,
      section_slug: row.sections!.slug,
      section_name: row.sections!.name,
      published_at: row.status === "published" ? row.published_at : row.scheduled_for,
      hero_storage_path: null,
      hero_alt: null,
      hero_credit: null,
      hero_width: null,
      hero_height: null,
      is_sponsored: row.is_sponsored,
      byline: null,
    }));
}

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const raw = (await searchParams).q;
  const q = (typeof raw === "string" ? raw : "").trim().slice(0, 80);
  const results = q ? await search(q) : [];

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
      <h1 className="font-serif text-4xl font-bold">Search</h1>
      <form role="search" action="/search" className="flex flex-wrap items-end gap-2">
        <label className="flex flex-1 flex-col gap-1 text-sm font-semibold">
          Search Eye Today
          <input type="search" name="q" defaultValue={q} maxLength={80} className="rounded border border-ink bg-white px-3 py-2 text-base font-normal" />
        </label>
        <button type="submit" className="rounded bg-ink px-4 py-2 text-paper">Search</button>
      </form>
      {q ? (
        <>
          <p className="text-sm text-muted" role="status">
            {results.length === 0 ? `No stories match “${q}”.` : `${results.length} ${results.length === 1 ? "story" : "stories"} for “${q}”.`}
          </p>
          <StoryList cards={results} />
        </>
      ) : null}
    </div>
  );
}
