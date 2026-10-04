"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getEditorContext } from "@/lib/auth/editor";

// Replaces the set of listings attached to one article. Editors only; RLS checks the role again.
export async function saveArticleListings(formData: FormData) {
  const ctx = await getEditorContext();
  if (!ctx) redirect("/login");
  const articleId = z.uuid().safeParse(formData.get("article_id"));
  if (!articleId.success) redirect("/admin/articles");
  const wanted = [
    ...new Set(
      formData
        .getAll("listing_ids")
        .filter((value): value is string => typeof value === "string" && z.uuid().safeParse(value).success),
    ),
  ].slice(0, 12);

  const { data: article } = await ctx.supabase
    .from("articles")
    .select("site_id, slug, sections(slug)")
    .eq("id", articleId.data)
    .maybeSingle<{ site_id: string; slug: string; sections: { slug: string } | { slug: string }[] | null }>();
  if (!article) redirect("/admin/articles");

  const { data: existing } = await ctx.supabase.from("article_listings").select("listing_id").eq("article_id", articleId.data);
  const current = (existing ?? []).map((row) => row.listing_id as string);
  const toDelete = current.filter((id) => !wanted.includes(id));
  const toInsert = wanted.filter((id) => !current.includes(id));

  if (toDelete.length) {
    const { error } = await ctx.supabase.from("article_listings").delete().eq("article_id", articleId.data).in("listing_id", toDelete);
    if (error) redirect(`/admin/articles/${articleId.data}?error=listings`);
  }
  if (toInsert.length) {
    const { error } = await ctx.supabase
      .from("article_listings")
      .insert(toInsert.map((listing_id) => ({ article_id: articleId.data, listing_id, site_id: article.site_id })));
    if (error) redirect(`/admin/articles/${articleId.data}?error=listings`);
  }

  const section = Array.isArray(article.sections) ? article.sections[0]?.slug : article.sections?.slug;
  if (section) revalidatePath(`/${section}/${article.slug}`);
  for (const id of new Set([...toDelete, ...toInsert])) {
    const { data } = await ctx.supabase.from("directory_listings").select("slug").eq("id", id).maybeSingle<{ slug: string }>();
    if (data) revalidatePath(`/directory/listing/${data.slug}`);
  }
  redirect(`/admin/articles/${articleId.data}?listings=saved`);
}
