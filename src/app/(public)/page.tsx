import Link from "next/link";

import { AdSlot } from "@/components/public/ad-slot";
import { Avatar } from "@/components/public/avatar";
import { NewsletterForm } from "@/components/public/newsletter-form";
import { SectionIcon } from "@/components/public/section-icon";
import { StoryCard } from "@/components/public/story-card";
import { SupporterHidden } from "@/components/public/supporter-hidden";
import { sectionStyle } from "@/lib/design/section";
import {
  type ArticleCard,
  articleHref,
  getCardAuthors,
  getHomepage,
  getLatest,
  getMostRead,
  getSectionArticles,
  getSections,
  type Section,
} from "@/lib/public/data";
import { isReservedSectionSlug } from "@/lib/public/reserved";

export const revalidate = 60;

// The in-river ad sits after this many stories in The Latest.
const IN_RIVER_AFTER = 5;
const SECONDARY = 4;

function RailHeading({ section, id }: { section: Section; id: string }) {
  return (
    <div style={sectionStyle(section.slug, section.color)} className="flex items-end justify-between gap-4 border-b-2 sec-rule pb-2">
      <h2 id={id} className="sec-text flex items-center gap-2 font-display text-2xl font-black">
        <SectionIcon name={section.icon} className="h-6 w-6" />
        <Link href={`/${section.slug}`} className="hover:underline">{section.name}</Link>
      </h2>
      <Link href={`/${section.slug}`} className="sec-text text-sm font-bold hover:underline">
        More<span className="sr-only"> {section.name}</span> →
      </Link>
    </div>
  );
}

function Rail({ section, cards }: { section: Section; cards: ArticleCard[] }) {
  if (!cards.length) return null;
  const id = `rail-${section.slug}`;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <RailHeading section={section} id={id} />
      <div className="grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <StoryCard key={card.article_slug} card={card} variant="standard" />
        ))}
      </div>
    </section>
  );
}

async function OpinionRail({ section, cards }: { section: Section; cards: ArticleCard[] }) {
  if (!cards.length) return null;
  const authors = await getCardAuthors(section.slug, cards.map((c) => c.article_slug));
  const byStory = new Map(authors.map((a) => [a.article_slug, a]));
  return (
    <section aria-labelledby="rail-opinion" className="flex flex-col gap-4 bg-white p-5 ring-1 ring-rule sm:p-6">
      <RailHeading section={section} id="rail-opinion" />
      <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => {
          const author = byStory.get(card.article_slug);
          const name = author?.display_name ?? card.byline;
          return (
            <li key={card.article_slug} className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <Avatar url={author?.avatar_url} name={name} size={56} />
                {name ? <p className="text-sm font-bold">{name}</p> : null}
              </div>
              <h3 className="font-display text-xl font-bold leading-snug">
                <Link href={articleHref(card)} className="hover:underline">{card.title}</Link>
              </h3>
            </li>
          );
        })}
      </ul>
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

  const lead = homepage.find((c) => c.slot === "lead") ?? latest[0];
  // The editors' picks first; if they chose fewer than four, the newest stories fill the row so it is never ragged.
  const picked = homepage.filter((c) => c.slot === "secondary");
  const shown = new Set([lead, ...picked].filter(Boolean).map((c) => `${c!.section_slug}/${c!.article_slug}`));
  const filler = latest.filter((c) => !shown.has(`${c.section_slug}/${c.article_slug}`));
  const secondary = [...picked, ...filler].slice(0, SECONDARY);

  const opinion = rails.find((r) => r.section.slug === "opinion");
  const otherRails = rails.filter((r) => r.section.slug !== "opinion");

  if (!lead) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-16 text-center">
        <h1 className="font-display text-3xl font-bold">The first stories are on their way.</h1>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 py-6">
      <h1 className="sr-only">Eye Today — top stories</h1>
      <section aria-label="Top stories" className="flex flex-col gap-6">
        <StoryCard card={lead} variant="lead" priority />
        {secondary.length ? (
          <div className="grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
            {secondary.map((card) => (
              <StoryCard key={`${card.section_slug}/${card.article_slug}`} card={card} variant="feature" />
            ))}
          </div>
        ) : null}
      </section>

      {/* Ads load after the page does. They sit below the cover block so a late creative moves nothing the reader can see. */}
      <AdSlot name="leaderboard" />

      <div className="grid gap-10 lg:grid-cols-3">
        <section aria-labelledby="latest" className="flex flex-col gap-4 lg:col-span-2">
          <h2 id="latest" className="border-b-2 border-ink pb-2 font-display text-2xl font-black">The Latest</h2>
          <div className="flex flex-col gap-4">
            {latest.map((card, index) => (
              <div key={card.article_slug} className="flex flex-col gap-4">
                <StoryCard card={card} variant="river" />
                {index === IN_RIVER_AFTER - 1 ? <AdSlot name="in-river" /> : null}
              </div>
            ))}
            {/* Fewer stories than the ad's position: show it at the end of the list instead. */}
            {latest.length < IN_RIVER_AFTER ? <AdSlot name="in-river" /> : null}
          </div>
        </section>

        <aside className="flex flex-col gap-8" aria-label="Most read and advertising">
          <SupporterHidden>
            <AdSlot name="bigbox-1" />
          </SupporterHidden>
          {mostRead.length ? (
            <section aria-labelledby="most-read" className="flex flex-col gap-3">
              <h2 id="most-read" className="border-b-2 border-ink pb-2 font-display text-2xl font-black">Most Read</h2>
              <ol className="flex flex-col gap-3">
                {mostRead.map((card, index) => (
                  <li key={card.article_slug}>
                    <StoryCard card={card} variant="numbered" rank={index + 1} />
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
          <SupporterHidden>
            <AdSlot name="bigbox-2" />
          </SupporterHidden>
        </aside>
      </div>

      {otherRails.map(({ section, cards }) => (
        <Rail key={section.id} section={section} cards={cards} />
      ))}

      {opinion ? <OpinionRail section={opinion.section} cards={opinion.cards} /> : null}

      <section aria-labelledby="home-newsletter" className="-mx-4 bg-brand px-4 py-10 text-paper sm:mx-0 sm:rounded sm:px-10">
        <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-2 md:items-center">
          <div className="flex flex-col gap-2">
            <h2 id="home-newsletter" className="font-display text-3xl font-black">Eye Today, in your inbox</h2>
            <p className="text-lg">The day&rsquo;s stories in the Daily Brief, the week&rsquo;s best reading in the Weekly Roundup. Free, and you can leave in one click.</p>
          </div>
          <div className="rounded bg-paper p-4 text-ink">
            <NewsletterForm compact />
          </div>
        </div>
      </section>
    </div>
  );
}
