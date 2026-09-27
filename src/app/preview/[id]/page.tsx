import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { ArticleView, type ArticleViewData } from "@/components/article-view";
import { loginPath } from "@/lib/auth/access";
import { getSession } from "@/lib/auth/session";
import { verifyPreviewToken } from "@/lib/preview-token";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function PreviewPage({ params, searchParams }: PageProps<"/preview/[id]">) {
  const { id } = await params;
  const { token } = await searchParams;

  // A bad or expired token is a 404, whoever asks.
  if (!verifyPreviewToken(id, token)) notFound();

  const { supabase, user, profile } = await getSession();
  if (!user) redirect(loginPath(`/preview/${id}?token=${encodeURIComponent(String(token))}`));
  if (profile?.role !== "editor" && profile?.role !== "admin") notFound();

  // The editor's own session: RLS lets editors read every article, in any status.
  const { data: article } = await supabase
    .from("articles")
    .select("title, dek, body_html, published_at, scheduled_for, is_sponsored, sponsor_name, status")
    .eq("id", id)
    .maybeSingle<ArticleViewData & { status: string }>();
  if (!article) notFound();

  return (
    <>
      <p role="status" className="bg-yellow-200 p-2 text-center text-sm text-black">
        Preview — status: {article.status}
      </p>
      <ArticleView article={article} />
    </>
  );
}
