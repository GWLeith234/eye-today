import type { ArticleCard } from "@/lib/public/data";

import { Pagination } from "./pagination";
import { StoryList } from "./story-card";

export function ListPage({
  title,
  intro,
  cards,
  page,
  total,
  basePath,
}: {
  title: string;
  intro?: React.ReactNode;
  cards: ArticleCard[];
  page: number;
  total: number;
  basePath: string;
}) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
      <h1 className="border-b-2 border-ink pb-2 font-serif text-4xl font-bold">{title}</h1>
      {intro}
      {cards.length ? <StoryList cards={cards} /> : <p className="text-muted">No stories here yet.</p>}
      <Pagination basePath={basePath} page={page} total={total} />
    </div>
  );
}
