import { format } from "date-fns";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import { ShareRow } from "@/components/public/share-row";
import { StoryCard } from "@/components/public/story-card";
import { NewsletterForm } from "@/components/public/newsletter-form";
import { SupportNote } from "@/components/public/support-note";
import { ViewBeacon } from "@/components/public/view-beacon";
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
  sections: { slug: string; name: string } | null;
  media: {
    storage_path: string;
    alt: string | null;
    credit: string | null;
    caption: string | null;
    width: number | null;
    height: number | null;
  } | null;
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
        "sections(slug, name), media(storage_path, alt, credit, caption, width, height)",
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

export default async function ArticlePage({ params }: PageProps<"/[section]/[slug]">) {
  const { section, slug } = await params;
  const article = await loadArticle(section, slug);
  if (!article || !article.sections) notFound();

  const [bylines, related] = await Promise.all([getBylines(article.id), getRelated(article.id)]);
  const published = publicDate(article);
  // Only show "Updated" when the edit came meaningfully after publication.
  const updated =
    published && new Date(article.updated_at).getTime() - new Date(published).getTime() > 60_000
      ? article.updated_at
      : null;
  const path = `/${article.sections.slug}/${slug}`;
  const origin = siteOrigin();
  const hero = article.media;

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

  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-8">
      <script
        type="application/ld+json"
        // JSON.stringify escapes quotes; escaping < keeps "</script>" in a title from closing the tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <p className="text-xs font-semibold uppercase tracking-widest">
        {article.is_sponsored ? <span className="mr-2 bg-ink px-1 py-0.5 text-paper">Sponsored</span> : null}
        <Link href={`/${article.sections.slug}`} className="text-accent hover:underline">
          {article.sections.name}
        </Link>
      </p>
      <h1 className="font-serif text-4xl font-bold leading-tight sm:text-5xl">{article.title}</h1>
      {article.dek ? <p className="text-xl text-muted">{article.dek}</p> : null}
      {article.is_sponsored ? (
        <p className="border-l-4 border-ink pl-3 text-sm">
          Sponsored content{article.sponsor_name ? <> paid for by <strong>{article.sponsor_name}</strong></> : null}.
          Eye Today&rsquo;s newsroom did not write or edit it.
        </p>
      ) : null}

      <div className="flex flex-col gap-1 border-y border-rule py-3 text-sm">
        {bylines.length ? (
          <p className="font-semibold">
            By{" "}
            {bylines.map((byline, index) => (
              <span key={index}>
                {index > 0 ? (index === bylines.length - 1 ? " and " : ", ") : null}
                {byline.author_slug ? (
                  <Link href={`/author/${byline.author_slug}`} className="hover:underline">
                    {byline.display_name ?? "Eye Today contributor"}
                  </Link>
                ) : (
                  (byline.display_name ?? "Eye Today contributor")
                )}
              </span>
            ))}
          </p>
        ) : null}
        <p className="flex flex-wrap gap-x-3 text-muted">
          {published ? <Time value={published} label="Published" /> : null}
          {updated ? <Time value={updated} label="Updated" /> : null}
        </p>
      </div>

      {hero ? (
        <figure className="flex flex-col gap-1">
          {hero.width && hero.height ? (
            <Image
              src={mediaUrl(hero.storage_path, { width: 1600 })}
              alt={hero.alt || ""}
              width={hero.width}
              height={hero.height}
              sizes="(min-width: 768px) 48rem, 100vw"
              preload
              className="h-auto w-full"
            />
          ) : (
            <div className="relative aspect-[3/2] w-full">
              <Image
                src={mediaUrl(hero.storage_path, { width: 1600 })}
                alt={hero.alt || ""}
                fill
                sizes="(min-width: 768px) 48rem, 100vw"
                preload
                className="object-cover"
              />
            </div>
          )}
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
      <div className="article-body flex flex-col gap-4" dangerouslySetInnerHTML={{ __html: sanitizeArticleHtml(article.body_html ?? "") }} />

      <section aria-label="Author disclosures" className="flex flex-col gap-2 rounded border border-rule bg-white/60 p-4 text-sm">
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

      <p role="note" className="border-l-4 border-accent bg-white/60 p-3 text-sm font-semibold">
        {MEDICAL_DISCLAIMER}
      </p>

      <SupportNote />

      {related.length ? (
        <section aria-labelledby="related-heading" className="flex flex-col gap-4 border-t-2 border-ink pt-4">
          <h2 id="related-heading" className="font-serif text-2xl font-bold">Related</h2>
          <div className="grid gap-6 sm:grid-cols-2">
            {related.map((card) => (
              <StoryCard key={`${card.section_slug}/${card.article_slug}`} card={card} />
            ))}
          </div>
        </section>
      ) : null}

      <section aria-label="Newsletter" className="flex flex-col gap-3 border-t-2 border-ink pt-4">
        <h2 className="font-serif text-2xl font-bold">Get Eye Today by email</h2>
        <NewsletterForm />
      </section>

      <ViewBeacon articleId={article.id} />
    </article>
  );
}
