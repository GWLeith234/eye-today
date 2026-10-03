import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ListPage } from "@/components/public/list-page";
import { BRAND } from "@/lib/brand/palette";
import { getTagArticles, getTagCount } from "@/lib/public/data";
import { parsePage } from "@/lib/public/paging";
import { createAnonClient } from "@/lib/supabase/anon";

export const revalidate = 60;

async function loadTag(slug: string) {
  const supabase = createAnonClient();
  if (!supabase) return null;
  const { data } = await supabase.from("tags").select("name, slug").eq("slug", slug).maybeSingle<{ name: string; slug: string }>();
  return data;
}

export async function generateMetadata({ params }: PageProps<"/tag/[slug]">): Promise<Metadata> {
  const tag = await loadTag((await params).slug);
  return tag ? { title: tag.name } : {};
}

export default async function TagPage({ params, searchParams }: PageProps<"/tag/[slug]">) {
  const tag = await loadTag((await params).slug);
  if (!tag) notFound();
  const page = parsePage((await searchParams).page);
  const [cards, total] = await Promise.all([getTagArticles(tag.slug, page), getTagCount(tag.slug)]);
  return <ListPage title={tag.name} cards={cards} page={page} total={total} basePath={`/tag/${tag.slug}`} tone={BRAND} />;
}
