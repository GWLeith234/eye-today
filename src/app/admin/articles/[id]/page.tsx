import { notFound } from "next/navigation";

import { isAssistantConfigured } from "@/lib/ai/claude";
import { requireArea } from "@/lib/auth/session";
import { mintPreviewToken } from "@/lib/preview-token";

import { ArticleEditor } from "../article-editor";
import { ListingAttach } from "../listing-attach";
import { loadEditorLists } from "../editor-data";

type ArticleRow = {
  id: string;
  title: string;
  dek: string | null;
  slug: string;
  section_id: string;
  hero_media_id: string | null;
  is_sponsored: boolean;
  comments_enabled: boolean;
  sponsor_name: string | null;
  sponsor_logo_media_id: string | null;
  seo_title: string | null;
  seo_description: string | null;
  status: string;
  scheduled_for: string | null;
  published_at: string | null;
  body_json: unknown;
  body_html: string | null;
  article_tags: { tag_id: string }[];
  article_authors: { profile_id: string; sort: number }[];
};

export default async function EditArticlePage({ params }: PageProps<"/admin/articles/[id]">) {
  const { supabase } = await requireArea("admin");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const [{ data: article }, { data: revisions }, lists] = await Promise.all([
    supabase
      .from("articles")
      .select(
        "id, title, dek, slug, section_id, hero_media_id, is_sponsored, comments_enabled, sponsor_name, sponsor_logo_media_id, seo_title, seo_description, status, scheduled_for, published_at, body_json, body_html, article_tags(tag_id), article_authors(profile_id, sort)",
      )
      .eq("id", id)
      .maybeSingle<ArticleRow>(),
    supabase
      .from("article_revisions")
      .select("id, created_at, snapshot->>title")
      .eq("article_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
    loadEditorLists(),
  ]);
  if (!article) notFound();

  const token = mintPreviewToken(article.id);

  return (
    <>
    <ArticleEditor
      article={{
        id: article.id,
        title: article.title,
        dek: article.dek ?? "",
        slug: article.slug,
        section_id: article.section_id,
        tag_ids: article.article_tags.map((t) => t.tag_id),
        author_ids: [...article.article_authors].sort((a, b) => a.sort - b.sort).map((a) => a.profile_id),
        hero_media_id: article.hero_media_id,
        is_sponsored: article.is_sponsored,
        comments_enabled: article.comments_enabled,
        sponsor_name: article.sponsor_name ?? "",
        sponsor_logo_media_id: article.sponsor_logo_media_id,
        seo_title: article.seo_title ?? "",
        seo_description: article.seo_description ?? "",
        status: article.status,
        scheduled_for: article.scheduled_for,
        published_at: article.published_at,
        body_json: article.body_json,
        // Rows written without body_json (imports, direct API edits) open from their stored HTML.
        body_html: article.body_html,
      }}
      {...lists}
      revisions={(revisions ?? []) as { id: string; created_at: string; title: string | null }[]}
      previewHref={token ? `/preview/${article.id}?token=${token}` : null}
      aiConfigured={isAssistantConfigured()}
    />
    <ListingAttach articleId={article.id} />
    </>
  );
}
