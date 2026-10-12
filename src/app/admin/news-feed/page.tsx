import Link from "next/link";

import { requireArea } from "@/lib/auth/session";
import { dateLabel } from "@/lib/newsroom/model";

type Row = { id: string; url: string; title: string; source_name: string; published_on: string; status: string; blurb: string };

export default async function NewsFeedAdminPage({ searchParams }: PageProps<"/admin/news-feed">) {
  const { supabase } = await requireArea("admin");
  const query = await searchParams;
  const { data: links } = await supabase
    .from("news_links")
    .select("id, url, title, source_name, published_on, status, blurb")
    .order("published_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(300)
    .returns<Row[]>();
  const done = query.done === "deleted" ? "Link removed." : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold">News feed</h1>
        <Link href="/admin/news-feed/new" className="rounded bg-ink px-3 py-1.5 text-sm text-paper">Add a link</Link>
      </div>
      <p className="text-sm">
        &ldquo;Ibogaine in the news&rdquo;: other outlets&rsquo; coverage, dated and credited. Readers see it at <code>/news-feed</code>, on the cover and in the newsletter.
        Every item links out to the outlet; the blurb is ours and never a copied paragraph.
      </p>
      {done ? <p role="status" className="rounded border border-green-600 p-2 text-sm">{done}</p> : null}
      {(links ?? []).length === 0 ? <p className="text-sm">No links yet.</p> : null}
      <ul className="flex flex-col gap-2">
        {(links ?? []).map((link) => (
          <li key={link.id} data-news-link={link.id} className="flex flex-wrap items-baseline gap-3 border border-rule p-3 text-sm">
            <Link href={`/admin/news-feed/${link.id}`} className="font-semibold underline">{link.title}</Link>
            <span className="text-muted">{link.source_name} · {dateLabel(link.published_on)}</span>
            <span className="rounded border border-rule px-2 text-xs">{link.status === "published" ? "Published" : "Draft"}</span>
            {!link.blurb ? <span className="text-xs text-amber-700">No blurb</span> : null}
            <a href={link.url} rel="noopener noreferrer" target="_blank" className="ml-auto text-xs underline">Open ↗</a>
          </li>
        ))}
      </ul>
    </div>
  );
}
