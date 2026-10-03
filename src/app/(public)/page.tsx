import Link from "next/link";

import { AdSlot } from "@/components/public/ad-slot";
import { AuthorFace } from "@/components/public/author-face";
import { NewsletterForm } from "@/components/public/newsletter-form";
import { SectionIcon } from "@/components/public/section-icon";
import { StoryCard } from "@/components/public/story-card";
import { SupporterHidden } from "@/components/public/supporter-hidden";
import { onBand, sectionBandVar, sectionIconName, sectionInkVar, sectionPaint } from "@/lib/brand/palette";
import { type ArticleCard, getHomepage, getLatest, getMostRead, getSectionArticles, getSectionFaces, getSections } from "@/lib/public/data";
import { isReservedSectionSlug } from "@/lib/public/reserved";

export const revalidate = 60;

// The in-river ad sits after this many stories in The Latest.
const IN_RIVER_AFTER = 5;

function Rail({ title, href, slug, icon, cards }: { title: string; href: string; slug: string; icon: string | null; cards: ArticleCard[] }) {
  if (!cards.length) return null;
  return (
    <section aria-labelledby={`rail-${href}`} className="flex flex-col gap-4">
      <h2 id={`rail-${href}`} className="flex items-center gap-2 border-b-2 pb-1 font-display text-2xl font-semibold" style={{ borderColor: sectionBandVar(slug), color: sectionInkVar(slug) }}>
        <SectionIcon name={sectionIconName(slug, icon)} />
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
  const sections = (await getSections()).filter((section) => !isReservedSectionSlug(section.slug));
  const [homepage, latest, mostRead, faces, rails] = await Promise.all([
    getHomepage(),
    getLatest(10, 0),
    getMostRead(5),
    getSectionFaces("opinion", 4),
    Promise.all(sections.map(async (section) => ({ section, cards: await getSectionArticles(section.slug, 1, 4) }))),
  ]);

  const lead = homepage.find((card) => card.slot === "lead");
  const secondary = homepage.filter((card) => card.slot === "secondary");
  const opinion = rails.find((rail) => rail.section.slug === "opinion");
  const otherRails = rails.filter((rail) => rail.section.slug !== "opinion");
  const faceBySlug = new Map(faces.map((face) => [face.article_slug, face]));

  if (!lead && latest.length === 0) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-16 text-center">
        <h1 className="font-display text-3xl font-semibold">The first stories are on their way.</h1>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-4 py-6">
      <AdSlot name="leaderboard" />

      {lead ? <StoryCard card={lead} variant="lead" priority /> : null}

      {secondary.length ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {secondary.map((card) => (
            <StoryCard key={card.article_slug} card={card} variant="feature" />
          ))}
        </div>
      ) : null}

      <div className="grid gap-10 lg:grid-cols-3">
        <section aria-labelledby="latest" className="flex flex-col gap-4 lg:col-span-2">
          <h2 id="latest" className="border-b-2 border-ink pb-1 font-display text-2xl font-semibold">The Latest</h2>
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
          <SupporterHidden>
            <AdSlot name="bigbox-1" />
          </SupporterHidden>
          <section aria-labelledby="most-read" className="flex flex-col gap-3">
            <h2 id="most-read" className="border-b-2 border-ink pb-1 font-display text-2xl font-semibold">Most Read</h2>
            <ol className="flex list-decimal flex-col gap-4 pl-6 marker:font-display marker:text-2xl marker:font-semibold marker:text-brand">
              {mostRead.map((card) => (
                <li key={card.article_slug}>
                  <StoryCard card={card} variant="numbered" />
                </li>
              ))}
            </ol>
          </section>
          <SupporterHidden>
            <AdSlot name="bigbox-2" />
          </SupporterHidden>
        </aside>
      </div>

      {otherRails.map(({ section, cards }) => (
        <Rail key={section.id} title={section.name} href={`/${section.slug}`} slug={section.slug} icon={section.icon} cards={cards} />
      ))}

      {opinion && opinion.cards.length ? (
        <section aria-labelledby="opinion" className="flex flex-col gap-4 p-4" style={{ background: sectionPaint("opinion", opinion.section.color), color: onBand(sectionPaint("opinion", opinion.section.color)) }}>
          <h2 id="opinion" className="flex items-center gap-2 font-display text-2xl font-semibold">
            <SectionIcon name={sectionIconName("opinion", opinion.section.icon)} />
            <Link href="/opinion" className="hover:underline">Opinion</Link>
          </h2>
          <div className="grid gap-6 bg-paper p-4 text-ink sm:grid-cols-2 lg:grid-cols-4">
            {opinion.cards.map((card) => {
              const face = faceBySlug.get(card.article_slug);
              const name = face?.display_name || card.byline || "Eye Today contributor";
              return (
                <div key={card.article_slug} className="flex flex-col gap-3">
                  <AuthorFace name={name} url={face?.avatar_url} />
                  <StoryCard card={card} variant="numbered" />
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <section aria-label="Newsletter" className="bg-brand px-4 py-8 text-paper">
        <div className="mx-auto grid max-w-7xl items-center gap-6 md:grid-cols-2">
          <div>
            <h2 className="font-display text-3xl font-semibold">Get Eye Today by email</h2>
            <p className="mt-2">The day&rsquo;s stories, once a day. The week&rsquo;s best, once a week.</p>
          </div>
          <div className="bg-paper p-4 text-ink">
            <NewsletterForm />
          </div>
        </div>
      </section>
    </div>
  );
}
