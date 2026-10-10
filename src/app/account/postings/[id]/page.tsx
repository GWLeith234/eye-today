import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { PostingFields } from "@/components/postings/posting-fields";
import { requireArea } from "@/lib/auth/session";
import { POSTING_FORM_ERRORS } from "@/lib/postings/form";
import { POSTING_EDIT_COLUMNS, type PostingEditRow, postingFieldValues } from "@/lib/postings/values";

import { savePosting } from "../actions";

export const dynamic = "force-dynamic";

export default async function EditPostingPage({ params, searchParams }: PageProps<"/account/postings/[id]">) {
  const { supabase, user } = await requireArea("account");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const query = await searchParams;
  const detail = typeof query.detail === "string" ? query.detail.slice(0, 200) : null;
  const error = typeof query.error === "string" ? (query.error === "invalid" && detail ? detail : POSTING_FORM_ERRORS[query.error]) : undefined;

  const { data: row } = await supabase
    .from("postings")
    .select(POSTING_EDIT_COLUMNS)
    .eq("id", id)
    .eq("poster_id", user.id)
    .neq("status", "expired")
    .maybeSingle<PostingEditRow>();
  if (!row) notFound();
  const { data: listing } = row.listing_id
    ? await supabase.from("directory_listings").select("slug").eq("id", row.listing_id).maybeSingle<{ slug: string }>()
    : { data: null };

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold">Edit posting</h1>
        <p className="text-sm text-muted"><Link href="/account/postings" className="underline">Back to your postings</Link></p>
      </header>
      {row.status === "published" ? (
        <p className="border border-rule p-3 text-sm">This posting is live. Saving a change takes it off the board until an editor approves it again. The time you paid for keeps running.</p>
      ) : null}
      {row.status === "rejected" && row.reject_reason ? <p className="border border-rule p-3 text-sm">Editor’s note: {row.reject_reason}</p> : null}
      {error ? <p role="alert" className="rounded border border-red-600 p-3 text-sm">{error}</p> : null}
      <form action={savePosting} className="grid max-w-xl gap-3">
        <input type="hidden" name="id" value={row.id} />
        <PostingFields kind={row.kind} values={postingFieldValues(row, listing?.slug ?? null)} />
        <button type="submit" className="self-start rounded bg-ink px-4 py-2 text-paper">
          {row.status === "draft" ? "Save draft" : "Save and send for review"}
        </button>
      </form>
    </main>
  );
}
