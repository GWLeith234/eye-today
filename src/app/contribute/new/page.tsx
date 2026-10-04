import { ArticleEditor } from "@/app/admin/articles/article-editor";
import { requireArea } from "@/lib/auth/session";

import { EditorsGoToAdmin } from "../editors-note";

export default async function NewContributionPage() {
  const { supabase, user, profile } = await requireArea("contribute");
  if (profile?.role !== "contributor") return <EditorsGoToAdmin />;

  const [{ data: sections }, { data: tags }] = await Promise.all([
    supabase.from("sections").select("id, name").order("sort").order("name"),
    supabase.from("tags").select("id, name").order("name"),
  ]);

  return (
    <ArticleEditor
      mode="contributor"
      article={{
        title: "",
        dek: "",
        slug: "",
        section_id: sections?.[0]?.id ?? "",
        tag_ids: [],
        author_ids: [user.id],
        hero_media_id: null,
        is_sponsored: false,
        comments_enabled: false,
        sponsor_name: "",
        seo_title: "",
        seo_description: "",
        status: "draft",
        scheduled_for: null,
        published_at: null,
        body_json: null,
        body_html: null,
      }}
      sections={sections ?? []}
      tags={tags ?? []}
      people={[]}
      media={[]}
      revisions={[]}
      previewHref={null}
    />
  );
}
