import { notFound } from "next/navigation";

import { ArticleEditor } from "@/app/admin/articles/article-editor";
import { requireArea } from "@/lib/auth/session";

import { EditorsGoToAdmin } from "../editors-note";

type ArticleRow = {
  id: string;
  title: string;
  dek: string | null;
  slug: string;
  section_id: string;
  seo_title: string | null;
  seo_description: string | null;
  status: string;
  scheduled_for: string | null;
  published_at: string | null;
  body_json: unknown;
  body_html: string | null;
  article_tags: { tag_id: string }[];
  article_authors: { profile_id: string }[];
};

type Note = { id: string; body: string; created_at: string; resolved: boolean };

export default async function EditContributionPage({ params }: PageProps<"/contribute/[id]">) {
  const { supabase, user, profile } = await requireArea("contribute");
  if (profile?.role !== "contributor") return <EditorsGoToAdmin />;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const [{ data: article }, { data: sections }, { data: tags }, { data: notes }] = await Promise.all([
    supabase
      .from("articles")
      .select(
        "id, title, dek, slug, section_id, seo_title, seo_description, status, scheduled_for, published_at, body_json, body_html, article_tags(tag_id), article_authors(profile_id)",
      )
      .eq("id", id)
      .maybeSingle<ArticleRow>(),
    supabase.from("sections").select("id, name").order("sort").order("name"),
    supabase.from("tags").select("id, name").order("name"),
    supabase
      .from("editorial_notes")
      .select("id, body, created_at, resolved")
      .eq("article_id", id)
      .order("created_at", { ascending: false })
      .returns<Note[]>(),
  ]);
  // Only stories the caller authors open here.
  if (!article || !article.article_authors.some((a) => a.profile_id === user.id)) notFound();

  return (
    <>
      {notes?.length ? (
        <section aria-label="Editor notes" className="mx-6 mt-6 flex flex-col gap-2 rounded border p-4">
          <h2 className="font-semibold">Notes from the editors</h2>
          <ol className="flex flex-col gap-2">
            {notes.map((note) => (
              <li key={note.id} className={note.resolved ? "opacity-60" : ""}>
                <p className="text-xs opacity-60">
                  {new Date(note.created_at).toLocaleString()} {note.resolved ? "· resolved" : ""}
                </p>
                <p className="whitespace-pre-wrap text-sm">{note.body}</p>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      <ArticleEditor
        mode="contributor"
        article={{
          id: article.id,
          title: article.title,
          dek: article.dek ?? "",
          slug: article.slug,
          section_id: article.section_id,
          tag_ids: article.article_tags.map((t) => t.tag_id),
          author_ids: [user.id],
          hero_media_id: null,
          is_sponsored: false,
          comments_enabled: false,
          sponsor_name: "",
          seo_title: article.seo_title ?? "",
          seo_description: article.seo_description ?? "",
          status: article.status,
          scheduled_for: article.scheduled_for,
          published_at: article.published_at,
          body_json: article.body_json,
          body_html: article.body_html,
        }}
        sections={sections ?? []}
        tags={tags ?? []}
        people={[]}
        media={[]}
        revisions={[]}
        previewHref={null}
      />
    </>
  );
}
