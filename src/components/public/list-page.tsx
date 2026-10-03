import { sectionStyle } from "@/lib/design/section";
import type { ArticleCard } from "@/lib/public/data";

import { Avatar } from "./avatar";
import { Pagination } from "./pagination";
import { SectionIcon } from "./section-icon";
import { StoryCard } from "./story-card";

export type Band = {
  // Small label above the title ("Section", "Tag", "Author").
  label: string;
  // Section pages pass their slug and stored colour; tag and author pages get the brand green.
  slug?: string;
  color?: string | null;
  icon?: string | null;
  avatarUrl?: string | null;
};

// A coloured header band, then the newest story as the lead and the rest in a grid.
export function ListPage({
  title,
  band,
  intro,
  cards,
  page,
  total,
  basePath,
}: {
  title: string;
  band: Band;
  intro?: React.ReactNode;
  cards: ArticleCard[];
  page: number;
  total: number;
  basePath: string;
}) {
  const [lead, ...rest] = cards;
  return (
    <>
      <div style={sectionStyle(band.slug ?? "", band.color)} className="sec-bg">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-8 sm:py-12">
          {band.avatarUrl !== undefined ? <Avatar url={band.avatarUrl} name={title} size={72} /> : null}
          <div className="flex flex-col gap-1">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest">
              <SectionIcon name={band.icon} className="h-4 w-4" />
              {band.label}
            </p>
            <h1 className="font-display text-4xl font-black leading-tight sm:text-5xl">{title}</h1>
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8">
        {intro}
        {lead ? (
          <>
            <StoryCard card={lead} variant="lead" priority />
            {rest.length ? (
              <ol className="grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
                {rest.map((card) => (
                  <li key={`${card.section_slug}/${card.article_slug}`}>
                    <StoryCard card={card} variant="standard" />
                  </li>
                ))}
              </ol>
            ) : null}
          </>
        ) : (
          <p className="text-muted">No stories here yet.</p>
        )}
        <Pagination basePath={basePath} page={page} total={total} />
      </div>
    </>
  );
}
