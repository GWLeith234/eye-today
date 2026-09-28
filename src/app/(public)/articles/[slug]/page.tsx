import { notFound, permanentRedirect } from "next/navigation";

import { createAnonClient } from "@/lib/supabase/anon";

// Old article URLs move to the canonical /<section>/<slug>. RLS returns live articles only.
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
  if (!data?.sections) notFound();
  permanentRedirect(`/${data.sections.slug}/${data.slug}`);
}
