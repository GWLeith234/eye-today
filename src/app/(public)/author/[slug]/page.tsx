import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ListPage } from "@/components/public/list-page";
import { getAuthor, getAuthorArticles, getAuthorCount } from "@/lib/public/data";
import { parsePage } from "@/lib/public/paging";

export const revalidate = 60;

export async function generateMetadata({ params }: PageProps<"/author/[slug]">): Promise<Metadata> {
  const author = await getAuthor((await params).slug);
  return author ? { title: author.display_name ?? "Author" } : {};
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
