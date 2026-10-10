import { format } from "date-fns";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import { AdSlot } from "@/components/public/ad-slot";
import { PollMounts } from "@/components/polls/poll-mounts";
import { Comments } from "@/components/public/comments";
import { AuthorFace } from "@/components/public/author-face";
import { ShareRow } from "@/components/public/share-row";
import { StoryCard } from "@/components/public/story-card";
import { NewsletterForm } from "@/components/public/newsletter-form";
import { inkOnPaper, sectionPaint } from "@/lib/brand/palette";
import { SupportNote } from "@/components/public/support-note";
import { ViewBeacon } from "@/components/public/view-beacon";
import { ListingCardView } from "@/components/public/listing-card";
import { getArticleListings } from "@/lib/directory/public";
import { sanitizeArticleHtml } from "@/lib/editor/sanitize";
import { mediaUrl } from "@/lib/media/url";
import { getBylines, getRelated } from "@/lib/public/data";
import { MEDICAL_DISCLAIMER } from "@/lib/public/disclaimer";
import { isReservedSectionSlug } from "@/lib/public/reserved";
import { SITE_DESCRIPTION, SITE_NAME, absoluteUrl, publicDate, siteOrigin } from "@/lib/public/site";
import { createAnonClient } from "@/lib/supabase/anon";

export const revalidate = 60;

// No paths at build time; each article renders on first request, then is cached.
export async function generateStaticParams() {
  return [];
}

type PublicArticle = {
  id: string;
  title: string;
  dek: string | null;
  body_html: string | null;
  published_at: string | null;
  scheduled_for: string | null;
  status: string;
  updated_at: string;
  is_sponsored: boolean;
  sponsor_name: string | null;
  seo_title: string | null;
  seo_description: string | null;
  sections: { slug: string; name: string; color: string | null } | null;
  media: {
    storage_path: string;
    alt: string | null;
    credit: string | null;
    caption: string | null;
    width: number | null;
    height: number | null;
  } | null;
  sponsor_logo: { storage_path: string; alt: string | null } | null;
};

// No status filter: RLS returns only published articles and scheduled ones whose time
// has come; the hero is readable by anon only when it belongs to a live article.
// cache(): generateMetadata and the page share one query per request.
const loadArticle = cache(async (sectionSlug: string, slug: string) => {
  if (isReservedSectionSlug(sectionSlug)) return null;
  const supabase = createAnonClient();
  if (!supabase) return null;
  const { data } = await supabase
    .from("articles")
    .select(
      "id, title, dek, body_html, published_at, scheduled_for, status, updated_at, is_sponsored, sponsor_name, seo_title, seo_description, " +
        "sections(slug, name, color), media:media!articles_hero_media_id_fkey(storage_path, alt, credit, caption, width, height), " +
        "sponsor_logo:media!articles_sponsor_logo_media_id_fkey(storage_path, alt)",
    )
    .eq("slug", slug)
    .limit(1)
    .maybeSingle<PublicArticle>();
  if (!data || data.sections?.slug !== sectionSlug) return null;
  return data;
});

const describe = (article: PublicArticle) => article.seo_description || article.dek || SITE_DESCRIPTION;

export async function generateMetadata({ params }: PageProps<"/[section]/[slug]">): Promise<Metadata> {
  const { section, slug } = await params;
  const article = await loadArticle(section, slug);
  if (!article) return {};
  // Relative on purpose: metadataBase (SITE_URL) makes these absolute when set.
  const canonical = `/${section}/${slug}`;
  const title = article.seo_title || article.title;
  const published = publicDate(article);
  return {
    title,
    description: describe(article),
    alternates: { canonical },
    openGraph: {
      type: "article",
      siteName: SITE_NAME,
      title,
      description: describe(article),
      url: canonical,
      publishedTime: published ?? undefined,
      modifiedTime: article.updated_at,
      section: article.sections?.name,
    },
  };
}

function Time({ value, label }: { value: string; label: string }) {
  return (
    <span>
      {label} <time dateTime={value}>{format(new Date(value), "d MMMM yyyy, h:mm a")}</time>
    </span>
  );
}

// Only decides whether to mount the comment region. The comments themselves are fetched per visitor, uncached.
async function isCommentsOpen(articleId: string): Promise<boolean> {
  const supabase = createAnonClient();
  if (!supabase) return false;
  const { data } = await supabase.rpc("comments_open", { p_article_id: articleId });
  return data === true;
}

export default async function ArticlePage({ params }: PageProps<"/[section]/[slug]">) {
  const { section, slug } = await params;
  const article = await loadArticle(section, slug);
  if (!article || !article.sections) notFound();

  const [bylines, related, listings, commentsOpen] = await Promise.all([
    getBylines(article.id),
    getRelated(article.id),
    getArticleListings(article.id),
    isCommentsOpen(article.id),
  ]);
  const published = publicDate(article);
  // Only show "Updated" when the edit came meaningfully after publication.
  const updated =
    published && new Date(article.updated_at).getTime() - new Date(published).getTime() > 60_000
      ? article.updated_at
      : null;
  const path = `/${article.sections.slug}/${slug}`;
  const origin = siteOrigin();
  const hero = article.media;
  const logo = article.is_sponsored ? article.sponsor_logo : null;

  // Structured data. Sponsored stories are Article, never NewsArticle. Disclosures
  // stay plain text on the page and are not part of it.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": article.is_sponsored ? "Article" : "NewsArticle",
    headline: article.title,
    description: describe(article),
    datePublished: published ? new Date(published).toISOString() : undefined,
    dateModified: new Date(article.updated_at).toISOString(),
    ...(origin ? { mainEntityOfPage: { "@type": "WebPage", "@id": `${origin}${path}` } } : {}),
    author: bylines.length
      ? bylines.map((byline) => ({
          "@type": "Person",
          name: byline.display_name ?? "Eye Today contributor",
          ...(byline.author_slug ? { url: absoluteUrl(`/author/${byline.author_slug}`) } : {}),
        }))
      : [{ "@type": "Organization", name: SITE_NAME }],
    publisher: { "@type": "Organization", name: SITE_NAME, ...(origin ? { url: origin } : {}) },
    image: [hero ? mediaUrl(hero.storage_path, { width: 1600 }) : absoluteUrl(`${path}/opengraph-image`)],
    articleSection: article.sections.name,
  };

  const tone = sectionPaint(article.sections.slug, article.sections.color);

  return (
    <article className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <script
        type="application/ld+json"
        // JSON.stringify escapes quotes; escaping < keeps "</script>" in a title from closing the tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <p className="text-xs font-semibold uppercase tracking-widest">
        {article.is_sponsored ? <span className="mr-2 bg-ink px-1 py-0.5 text-paper">Sponsored</span> : null}
        <Link href={`/${article.sections.slug}`} className="hover:underline" style={{ color: inkOnPaper(tone) }}>
          {article.sections.name}
        </Link>
      </p>
      <h1 className="max-w-3xl font-display text-4xl font-semibold leading-tight sm:text-6xl">{article.title}</h1>
      {article.dek ? <p className="text-xl text-muted">{article.dek}</p> : null}
      {article.is_sponsored ? (
        <div className="flex items-center gap-3 border-l-4 border-ink pl-3 text-sm">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- sponsor logo from Supabase Storage, natural size
            <img
              src={mediaUrl(logo.storage_path, { width: 240 })}
              alt={logo.alt || article.sponsor_name || "Sponsor logo"}
              loading="lazy"
              className="max-h-12 w-auto max-w-[8rem] shrink-0"
            />
          ) : null}
          <p>
            Sponsored content{article.sponsor_name ? <> paid for by <strong>{article.sponsor_name}</strong></> : null}.
            Eye Today&rsquo;s newsroom did not write or edit it.
          </p>
        </div>
      ) : null}

      <div className="flex max-w-3xl flex-col gap-3 border-y border-rule py-4 text-sm">
        {bylines.length ? (
          <ul className="flex flex-col gap-3">
            {bylines.map((byline, index) => {
              const name = byline.display_name ?? "Eye Today contributor";
              return (
                <li key={index} className="flex items-center gap-3">
                  <AuthorFace name={name} url={byline.avatar_url} />
                  <p className="font-semibold">
                    {byline.author_slug ? (
                      <Link href={`/author/${byline.author_slug}`} className="hover:underline">{name}</Link>
                    ) : (
                      name
                    )}
                  </p>
                </li>
              );
            })}
          </ul>
        ) : null}
        <p className="flex flex-wrap gap-x-3 text-muted">
          {published ? <Time value={published} label="Published" /> : null}
          {updated ? <Time value={updated} label="Updated" /> : null}
        </p>
      </div>

      {hero ? (
        <figure className="flex flex-col gap-2">
          <div className="relative aspect-[3/2] w-full overflow-hidden bg-rule">
            <Image
              src={mediaUrl(hero.storage_path, { width: 1600 })}
              alt={hero.alt || ""}
              fill
              sizes="(min-width: 1024px) 64rem, 100vw"
              preload
              className="object-cover"
            />
          </div>
          {hero.caption || hero.credit ? (
            <figcaption className="text-xs text-muted">
              {hero.caption}
              {hero.caption && hero.credit ? " " : null}
              {hero.credit ? <span>Photo: {hero.credit}</span> : null}
            </figcaption>
          ) : null}
        </figure>
      ) : null}

      <ShareRow path={path} title={article.title} origin={origin} />

      {/* body_html is sanitized when saved and again here in case a row was written elsewhere. */}
      <div className="article-body mx-auto flex w-full max-w-3xl flex-col gap-4" dangerouslySetInnerHTML={{ __html: sanitizeArticleHtml(article.body_html ?? "", { sponsored: article.is_sponsored }) }} />
      <PollMounts />

      <AdSlot name="in-article" />

      <section aria-label="Author disclosures" className="mx-auto flex w-full max-w-3xl flex-col gap-2 border border-rule border-l-4 bg-paper p-4 text-sm" style={{ borderLeftColor: tone }}>
        <h2 className="font-semibold uppercase tracking-widest">Disclosure</h2>
        {bylines.length ? (
          bylines.map((byline, index) => (
            <p key={index} className="whitespace-pre-wrap">
              {/* Plain text only: React escapes it; disclosures are never rendered as HTML. */}
              <span className="font-semibold">{byline.display_name ?? "Eye Today contributor"}: </span>
              {byline.disclosure?.trim() ? byline.disclosure : "No disclosure on file."}
            </p>
          ))
        ) : (
          <p>No disclosure on file.</p>
        )}
      </section>

      <p role="note" className="mx-auto w-full max-w-3xl border border-rule border-l-4 border-l-accent bg-paper p-4 text-sm font-semibold text-ink">
        {MEDICAL_DISCLAIMER}{" "}
        <Link href="/disclaimer" className="underline">Read the full disclaimer</Link>
      </p>

      {commentsOpen ? <Comments articleId={article.id} /> : null}

      <SupportNote />

      {listings.length ? (
        <section aria-labelledby="story-listings" className="flex flex-col gap-2 border-t-2 border-ink pt-4">
          <h2 id="story-listings" className="font-display text-2xl font-semibold">In the directory</h2>
          <p className="text-sm text-muted">Listings mentioned in this story. A listing is not an endorsement.</p>
          <div>
            {listings.map((card) => (
              <ListingCardView key={card.slug} card={card} />
            ))}
          </div>
        </section>
      ) : null}

      {related.length ? (
        <section aria-labelledby="related-heading" className="flex flex-col gap-4 border-t-2 border-ink pt-4">
          <h2 id="related-heading" className="font-display text-2xl font-semibold">Related</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {related.map((card) => (
              <StoryCard key={`${card.section_slug}/${card.article_slug}`} card={card} />
            ))}
          </div>
        </section>
      ) : null}

      <section aria-label="Newsletter" className="bg-brand px-4 py-6 text-paper">
        <div className="mx-auto grid max-w-3xl items-center gap-4 md:grid-cols-2">
          <h2 className="font-display text-2xl font-semibold">Get Eye Today by email</h2>
          <div className="bg-paper p-4 text-ink">
            <NewsletterForm compact />
          </div>
        </div>
      </section>

      <ViewBeacon articleId={article.id} />
    </article>
  );
}
