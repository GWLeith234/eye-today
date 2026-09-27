import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ArticleView, type ArticleViewData } from "@/components/article-view";
import { createAnonClient } from "@/lib/supabase/anon";

export const dynamic = "force-dynamic";

type PublicArticle = ArticleViewData & { seo_title: string | null; seo_description: string | null };

// No status filter: RLS returns published articles and scheduled ones whose time has come.
async function loadArticle(slug: string) {
  const supabase = createAnonClient();
  if (!supabase) return null;
  const { data } = await supabase
    .from("articles")
    .select("title, dek, body_html, published_at, scheduled_for, is_sponsored, sponsor_name, seo_title, seo_description")
    .eq("slug", slug)
    .limit(1)
    .maybeSingle<PublicArticle>();
  return data;
}

export async function generateMetadata({ params }: PageProps<"/articles/[slug]">): Promise<Metadata> {
  const article = await loadArticle((await params).slug);
  if (!article) return {};
  return {
    title: `${article.seo_title || article.title} — Eye Today`,
    description: article.seo_description || article.dek || undefined,
  };
}

export default async function ArticlePage({ params }: PageProps<"/articles/[slug]">) {
  const article = await loadArticle((await params).slug);
  if (!article) notFound();
  return <ArticleView article={article} />;
}
