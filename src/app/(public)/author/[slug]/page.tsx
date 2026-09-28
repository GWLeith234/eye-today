import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ListPage } from "@/components/public/list-page";
import { getAuthor, getAuthorArticles, getAuthorCount } from "@/lib/public/data";
import { parsePage } from "@/lib/public/paging";
import { SITE_NAME } from "@/lib/public/site";

// Collapses whitespace and cuts at a word boundary, adding an ellipsis when shortened.
function trimText(text: string, max: number) {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 40 ? cut.lastIndexOf(" ") : cut.length).trimEnd()}…`;
}

export const revalidate = 60;

export async function generateMetadata({ params }: PageProps<"/author/[slug]">): Promise<Metadata> {
  const author = await getAuthor((await params).slug);
  if (!author) return {};
  const title = author.display_name ?? "Author";
  const canonical = `/author/${author.slug}`;
  const description = author.bio?.trim() ? trimText(author.bio, 160) : undefined;
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { type: "profile", siteName: SITE_NAME, title, description, url: canonical },
  };
}

export default async function AuthorPage({ params, searchParams }: PageProps<"/author/[slug]">) {
  const author = await getAuthor((await params).slug);
  if (!author) notFound();
  const page = parsePage((await searchParams).page);
  const [cards, total] = await Promise.all([getAuthorArticles(author.slug, page), getAuthorCount(author.slug)]);

  return (
    <ListPage
      title={author.display_name ?? "Eye Today contributor"}
      intro={
        <div className="flex flex-col gap-3">
          {author.bio ? <p className="whitespace-pre-wrap text-lg">{author.bio}</p> : null}
          <section aria-label="Disclosure" className="border border-rule bg-white/60 p-3 text-sm">
            <h2 className="font-semibold">Disclosure</h2>
            <p className="whitespace-pre-wrap">{author.disclosure?.trim() || "No disclosure on file."}</p>
          </section>
        </div>
      }
      cards={cards}
      page={page}
      total={total}
      basePath={`/author/${author.slug}`}
    />
  );
}
