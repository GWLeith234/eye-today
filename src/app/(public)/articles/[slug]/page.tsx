import { notFound, permanentRedirect } from "next/navigation";

import { createAnonClient } from "@/lib/supabase/anon";

// Old article URLs move to the canonical /<section>/<slug>. RLS returns live articles only;
// slugs an article used to have go through article_slug_redirect_any (0006).
export default async function LegacyArticlePage({ params }: PageProps<"/articles/[slug]">) {
  const { slug } = await params;
  const supabase = createAnonClient();
  if (!supabase) notFound();
  const { data } = await supabase
    .from("articles")
    .select("slug, sections(slug)")
    .eq("slug", slug)
    .limit(1)
    .maybeSingle<{ slug: string; sections: { slug: string } | null }>();
  if (data?.sections) permanentRedirect(`/${data.sections.slug}/${data.slug}`);

  // Not a current slug: maybe an old one. The function returns the live article's
  // current path (one hop), or null.
  const { data: moved } = await supabase.rpc("article_slug_redirect_any", { slug });
  if (typeof moved === "string" && moved.startsWith("/")) permanentRedirect(moved);
  notFound();
}
