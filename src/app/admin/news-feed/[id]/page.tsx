import Link from "next/link";
import { notFound } from "next/navigation";

import { requireArea } from "@/lib/auth/session";

import { deleteNewsLink } from "../actions";
import { LinkForm } from "../link-form";

type Row = { id: string; url: string; title: string; source_name: string; published_on: string; blurb: string; tags: string[]; status: "draft" | "published" };

export default async function EditNewsLinkPage({ params, searchParams }: PageProps<"/admin/news-feed/[id]">) {
  const { id } = await params;
  const { supabase } = await requireArea("admin");
  const query = await searchParams;
  const { data } = await supabase
    .from("news_links")
    .select("id, url, title, source_name, published_on, blurb, tags, status")
    .eq("id", id)
    .maybeSingle<Row>();
  if (!data) notFound();

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm"><Link href="/admin/news-feed" className="underline">← News feed</Link></p>
      <h1 className="text-2xl font-semibold">Edit link</h1>
      <LinkForm
        values={{ ...data, tags: data.tags.join(", ") }}
        notice={query.saved === "1" ? "Saved." : undefined}
      />
      <form action={deleteNewsLink} className="max-w-2xl border-t border-rule pt-4">
        <input type="hidden" name="id" value={data.id} />
        <button type="submit" className="rounded border border-red-600 px-3 py-1.5 text-sm text-red-700">Remove from the feed</button>
      </form>
    </div>
  );
}
