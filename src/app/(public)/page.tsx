import Link from "next/link";

import { AdSlot } from "@/components/public/ad-slot";
import { StoryCard } from "@/components/public/story-card";
import { type ArticleCard, getHomepage, getLatest, getMostRead, getSectionArticles, getSections } from "@/lib/public/data";
import { isReservedSectionSlug } from "@/lib/public/reserved";

export const revalidate = 60;

// The in-river ad sits after this many stories in The Latest.
const IN_RIVER_AFTER = 5;

function Rail({ title, href, cards }: { title: string; href: string; cards: ArticleCard[] }) {
  if (!cards.length) return null;
  return (
    <section aria-labelledby={`rail-${href}`} className="flex flex-col gap-4">
      <h2 id={`rail-${href}`} className="border-b-2 border-ink pb-1 font-serif text-2xl font-bold">
        <Link href={href} className="hover:underline">{title}</Link>
      </h2>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <StoryCard key={card.article_slug} card={card} />
        ))}
      </div>
    </section>
  );
}

export default async function HomePage() {
  const sections = (await getSections()).filter((s) => !isReservedSectionSlug(s.slug));
  const [homepage, latest, mostRead, rails] = await Promise.all([
    getHomepage(),
    getLatest(10, 0),
    getMostRead(5),
    Promise.all(sections.map(async (section) => ({ section, cards: await getSectionArticles(section.slug, 1, 4) }))),
  ]);

  const lead = homepage.find((c) => c.slot === "lead");
  const secondary = homepage.filter((c) => c.slot === "secondary");
  const opinion = rails.find((r) => r.section.slug === "opinion");
  const otherRails = rails.filter((r) => r.section.slug !== "opinion");

  if (!lead && latest.length === 0) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-16 text-center">
        <p className="font-serif text-2xl">The first stories are on their way.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-6">
      <AdSlot name="leaderboard" />

      <section aria-label="Top stories" className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">{lead ? <StoryCard card={lead} variant="lead" priority /> : null}</div>
        <div className="flex flex-col gap-6">
          {secondary.map((card) => (
            <StoryCard key={card.article_slug} card={card} />
          ))}
        </div>
      </section>

      <div className="grid gap-10 lg:grid-cols-3">
        <section aria-labelledby="latest" className="flex flex-col gap-4 lg:col-span-2">
          <h2 id="latest" className="border-b-2 border-ink pb-1 font-serif text-2xl font-bold">The Latest</h2>
          <div className="flex flex-col gap-4">
            {latest.map((card, index) => (
              <div key={card.article_slug} className="flex flex-col gap-4">
                <StoryCard card={card} variant="compact" />
                {index === IN_RIVER_AFTER - 1 ? <AdSlot name="in-river" /> : null}
              </div>
            ))}
            {/* Fewer stories than the ad's position: show it at the end of the list instead. */}
            {latest.length < IN_RIVER_AFTER ? <AdSlot name="in-river" /> : null}
          </div>
        </section>

        <aside className="flex flex-col gap-6" aria-label="Most read and advertising">
          <AdSlot name="bigbox-1" />
          <section aria-labelledby="most-read" className="flex flex-col gap-3">
            <h2 id="most-read" className="border-b-2 border-ink pb-1 font-serif text-2xl font-bold">Most Read</h2>
            <ol className="flex list-decimal flex-col gap-3 pl-6 marker:font-serif marker:text-xl marker:font-bold">
              {mostRead.map((card) => (
                <li key={card.article_slug}>
                  <StoryCard card={card} variant="compact" />
                </li>
              ))}
            </ol>
          </section>
          <AdSlot name="bigbox-2" />
        </aside>
      </div>

      {opinion && opinion.cards.length ? (
        <section aria-labelledby="opinion" className="flex flex-col gap-4 bg-white/60 p-4 ring-1 ring-rule">
          <h2 id="opinion" className="font-serif text-2xl font-bold">
            <Link href="/opinion" className="hover:underline">Opinion</Link>
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {opinion.cards.map((card) => (
              <StoryCard key={card.article_slug} card={card} variant="compact" />
            ))}
          </div>
        </section>
      ) : null}

      {otherRails.map(({ section, cards }) => (
        <Rail key={section.id} title={section.name} href={`/${section.slug}`} cards={cards} />
      ))}
    </div>
  );
}
