import type { Metadata } from "next";
import Link from "next/link";

import { NewsLinkItem } from "@/components/newsroom/news-feed-list";
import { TopAds } from "@/components/public/page-ads";
import { SupportNote } from "@/components/public/support-note";
import { FEED_PAGE_SIZE, newsFeed, newsFeedCount } from "@/lib/newsroom/public";
import { parsePage } from "@/lib/public/paging";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ibogaine in the news",
  description: "Coverage of ibogaine and addiction treatment from other outlets, dated and credited, chosen by Eye Today's editors.",
  alternates: { canonical: "/news-feed" },
};

export default async function NewsFeedPage({ searchParams }: PageProps<"/news-feed">) {
  const params = await searchParams;
  const page = parsePage(params.page);
  const [links, total] = await Promise.all([newsFeed(page), newsFeedCount()]);
  const pages = Math.max(1, Math.ceil(total / FEED_PAGE_SIZE));

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <h1 className="font-serif text-4xl font-bold">Ibogaine in the news</h1>
      <TopAds page="other" />
      <p>
        What other outlets are reporting on ibogaine, psychedelic medicine and addiction treatment. Our editors pick the links and write a line on each;
        the reporting is the outlet&rsquo;s own, so every headline opens on their site.
      </p>
      {links.length === 0 ? <p role="status">{page > 1 ? "No more links." : "The feed is being set up."}</p> : null}
      <div className="flex flex-col gap-4">
        {links.map((link) => (
          <NewsLinkItem key={link.id} link={link} />
        ))}
      </div>
      {pages > 1 ? (
        <nav aria-label="Pages" className="flex items-center justify-between text-sm">
          {page > 1 ? <Link href={`/news-feed?page=${page - 1}`} className="underline">Newer</Link> : <span />}
          <span className="text-muted">Page {page} of {pages}</span>
          {page < pages ? <Link href={`/news-feed?page=${page + 1}`} className="underline">Older</Link> : <span />}
        </nav>
      ) : null}
      <p className="text-xs text-muted">
        Spotted coverage we missed? Write to <a href="mailto:newsroom@theeye.today" className="underline">newsroom@theeye.today</a>.
      </p>
      <SupportNote />
    </div>
  );
}
