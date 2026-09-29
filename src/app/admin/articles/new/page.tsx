import { isAssistantConfigured } from "@/lib/ai/claude";
import { requireArea } from "@/lib/auth/session";

import { ArticleEditor } from "../article-editor";
import { loadEditorLists } from "../editor-data";

export default async function NewArticlePage() {
  const { user } = await requireArea("admin");
  const lists = await loadEditorLists();

  return (
    <ArticleEditor
      article={{
        title: "",
        dek: "",
        slug: "",
        section_id: lists.sections[0]?.id ?? "",
        tag_ids: [],
        author_ids: [user.id],
        hero_media_id: null,
        is_sponsored: false,
        sponsor_name: "",
        seo_title: "",
        seo_description: "",
        status: "draft",
        scheduled_for: null,
        published_at: null,
        body_json: null,
        body_html: null,
      }}
      {...lists}
      revisions={[]}
      previewHref={null}
      aiConfigured={isAssistantConfigured()}
    />
  );
}
