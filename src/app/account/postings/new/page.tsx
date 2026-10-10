import Link from "next/link";

import { EMPTY_POSTING_FIELDS, PostingFields } from "@/components/postings/posting-fields";
import { requireArea } from "@/lib/auth/session";
import { POSTING_FORM_ERRORS } from "@/lib/postings/form";

import { savePosting } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewPostingPage({ searchParams }: PageProps<"/account/postings/new">) {
  await requireArea("account");
  const params = await searchParams;
  const kind = params.kind === "classified" ? "classified" : "job";
  const detail = typeof params.detail === "string" ? params.detail.slice(0, 200) : null;
  const error = typeof params.error === "string" ? (params.error === "invalid" && detail ? detail : POSTING_FORM_ERRORS[params.error]) : undefined;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold">{kind === "job" ? "Post a job" : "Post a classified"}</h1>
        <p className="text-sm text-muted">
          Save it as a draft, then pay for 30 or 60 days from <Link href="/account/postings" className="underline">Your postings</Link>. An editor checks every posting
          before it goes live. Read the <Link href="/jobs/policy" className="underline">posting policy</Link> first.{" "}
          {kind === "job" ? <Link href="/account/postings/new?kind=classified" className="underline">Post a classified instead</Link> : <Link href="/account/postings/new?kind=job" className="underline">Post a job instead</Link>}
        </p>
      </header>
      {error ? <p role="alert" className="rounded border border-red-600 p-3 text-sm">{error}</p> : null}
      <form action={savePosting} className="grid max-w-xl gap-3">
        <PostingFields kind={kind} values={EMPTY_POSTING_FIELDS} />
        <button type="submit" className="self-start rounded bg-ink px-4 py-2 text-paper">Save draft</button>
      </form>
    </main>
  );
}
