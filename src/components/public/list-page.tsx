import { Fragment } from "react";

import type { PageType } from "@/lib/ads/slots";
import { onBand, sectionIconName } from "@/lib/brand/palette";
import type { ArticleCard } from "@/lib/public/data";

import { RiverAd, SideAds, TopAds } from "./page-ads";
import { Pagination } from "./pagination";
import { SectionIcon } from "./section-icon";
import { StoryCard } from "./story-card";

export function ListPage({
  title,
  intro,
  cards,
  page,
  total,
  basePath,
  tone = "#1E5B4A",
  icon = null,
  slug = "",
  ads = "section",
  sponsored = null,
}: {
  title: string;
  intro?: React.ReactNode;
  cards: ArticleCard[];
  page: number;
  total: number;
  basePath: string;
  tone?: string;
  icon?: string | null;
  slug?: string;
  // The page type the ad units report under; "other" pages still carry the leaderboard.
  ads?: PageType;
  sponsored?: React.ReactNode;
}) {
  const lead = page === 1 ? cards[0] : undefined;
  const rest = page === 1 ? cards.slice(1) : cards;
  return (
    <div className="flex w-full flex-col">
      <header className="px-4 py-8" style={{ background: tone, color: onBand(tone) }}>
        <div className="mx-auto flex max-w-7xl items-center gap-3">
          <SectionIcon name={sectionIconName(slug, icon)} className="size-8" />
          <h1 className="font-display text-4xl font-semibold sm:text-5xl">{title}</h1>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8">
        {intro}
        <TopAds page={ads} />
        {lead ? <StoryCard card={lead} variant="lead" priority /> : null}
        {rest.length ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {rest.map((card, index) => (
              <Fragment key={`${card.section_slug}/${card.article_slug}`}>
                <StoryCard card={card} variant="standard" />
                {/* The in-river unit takes a full row of the grid. */}
                <RiverAd page={ads} index={index} count={rest.length} className="sm:col-span-2 lg:col-span-3" />
              </Fragment>
            ))}
          </div>
        ) : null}
        {cards.length ? null : <p className="text-muted">No stories here yet.</p>}
        {sponsored}
        <SideAds page={ads} />
        <Pagination basePath={basePath} page={page} total={total} />
      </div>
    </div>
  );
}
