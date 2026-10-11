import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { EditionReader } from "@/components/editions/reader";
import { htmlToBlocks } from "@/lib/editions/blocks";
import { buildPages, issueLabel } from "@/lib/editions/model";
import { getEdition, getEditionStories } from "@/lib/editions/public";
import { sanitizeArticleHtml } from "@/lib/editor/sanitize";
import { mediaUrl } from "@/lib/media/url";
import { absoluteUrl } from "@/lib/public/site";
import { SLUG_RE } from "@/lib/slug";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/editions/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  if (!SLUG_RE.test(slug)) return {};
  const edition = await getEdition(slug);
  if (!edition) return {};
  return {
    title: `${edition.title} — ${issueLabel(edition.issue_month)} edition`,
    description: `Eye Today’s ${issueLabel(edition.issue_month)} e-edition.`,
    alternates: { canonical: `/editions/${edition.slug}` },
    robots: edition.access === "early" ? { index: false } : undefined,
    openGraph: edition.cover_storage_path ? { images: [mediaUrl(edition.cover_storage_path, { width: 1200 })] } : undefined,
  };
}

export default async function EditionPage({ params }: PageProps<"/editions/[slug]">) {
  const { slug } = await params;
  if (!SLUG_RE.test(slug)) notFound();
  const edition = await getEdition(slug);
  if (!edition) notFound();
  const rows = await getEditionStories(edition.id);
  const stories = rows.map((story) => ({
    article_slug: story.article_slug,
    title: story.title,
    section_slug: story.section_slug,
    section_name: story.section_name,
    dek: story.dek,
    byline: story.byline,
    published_at: story.published_at,
    hero: story.hero_storage_path ? { src: mediaUrl(story.hero_storage_path, { width: 1200 }), alt: story.hero_alt ?? "", credit: story.hero_credit } : null,
    html: sanitizeArticleHtml(story.body_html ?? ""),
    words: htmlToBlocks(story.body_html ?? "").reduce((n, b) => n + (b.kind === "list" ? b.items.join(" ") : b.text).split(/\s+/).length, 0),
  }));
  const pages = buildPages(edition, stories);
  const label = issueLabel(edition.issue_month);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "PublicationIssue",
    name: edition.title,
    issueNumber: edition.slug,
    datePublished: edition.public_from,
    url: absoluteUrl(`/editions/${edition.slug}`),
    ...(edition.cover_storage_path ? { image: mediaUrl(edition.cover_storage_path, { width: 1200 }) } : {}),
    isPartOf: { "@type": "Periodical", name: "Eye Today", url: absoluteUrl("/editions") },
    hasPart: stories.map((story) => ({ "@type": "Article", headline: story.title, url: absoluteUrl(`/${story.section_slug}/${story.article_slug}`) })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <EditionReader
        edition={{
          slug: edition.slug,
          title: edition.title,
          label,
          cover: edition.cover_storage_path ? { src: mediaUrl(edition.cover_storage_path, { width: 1200 }), alt: edition.cover_alt ?? "" } : null,
          letterHtml: sanitizeArticleHtml(edition.letter_html),
          hasPdf: !!edition.pdf_path,
          early: edition.access === "early",
        }}
        pages={pages}
      />
    </>
  );
}
