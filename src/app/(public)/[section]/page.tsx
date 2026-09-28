import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ListPage } from "@/components/public/list-page";
import { getSection, getSectionArticles, getSectionCount } from "@/lib/public/data";
import { parsePage } from "@/lib/public/paging";
import { isReservedSectionSlug } from "@/lib/public/reserved";

export const revalidate = 60;

async function load(slug: string) {
  if (isReservedSectionSlug(slug)) return null;
  return getSection(slug);
}

export async function generateMetadata({ params }: PageProps<"/[section]">): Promise<Metadata> {
  const section = await load((await params).section);
  return section ? { title: section.name, alternates: { canonical: `/${section.slug}` } } : {};
}

export default async function SectionPage({ params, searchParams }: PageProps<"/[section]">) {
  const section = await load((await params).section);
  if (!section) notFound();
  const page = parsePage((await searchParams).page);
  const [cards, total] = await Promise.all([getSectionArticles(section.slug, page), getSectionCount(section.slug)]);
  return <ListPage title={section.name} cards={cards} page={page} total={total} basePath={`/${section.slug}`} />;
}
