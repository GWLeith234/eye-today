"use client";

import { useActionState } from "react";

import { PostingFields, type PostingFieldValues } from "@/components/postings/posting-fields";
import type { PostingKind } from "@/lib/postings/types";

import { editPosting, type SaveState } from "./actions";

export function PostingEditForm({ id, kind, values }: { id: string; kind: PostingKind; values: PostingFieldValues }) {
  const [state, action, pending] = useActionState(editPosting, { error: null } satisfies SaveState);
  return (
    <form action={action} className="grid max-w-xl gap-3">
      {state.error ? <p role="alert" className="rounded border border-red-600 p-2 text-sm">{state.error}</p> : null}
      <input type="hidden" name="id" value={id} />
      <PostingFields kind={kind} values={values} />
      <button type="submit" disabled={pending} className="self-start rounded bg-ink px-4 py-2 text-paper disabled:opacity-50">
        {pending ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
