import Link from "next/link";

import { requireArea } from "@/lib/auth/session";

import { saveDisclosure } from "../actions";
import { EditorsGoToAdmin } from "../editors-note";

export default async function DisclosurePage({ searchParams }: PageProps<"/contribute/disclosure">) {
  const { supabase, user, profile } = await requireArea("contribute");
  if (profile?.role !== "contributor") return <EditorsGoToAdmin />;
  const params = await searchParams;

  const { data: disclosure } = await supabase.from("disclosures").select("text").eq("profile_id", user.id).maybeSingle<{ text: string }>();

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 p-8">
      <h1 className="text-3xl font-bold">Your disclosure</h1>
      <p className="text-sm">
        List any affiliations, funding, or relationships readers should know about. It is shown under your name on every
        published story. If you have none, write &ldquo;No affiliations&rdquo;.
      </p>
      {params.saved === "1" ? <p role="status" className="rounded border border-green-600 p-2 text-sm">Disclosure saved.</p> : null}
      {params.error === "invalid" ? (
        <p role="alert" className="rounded border border-red-600 p-2 text-sm">Your disclosure can&apos;t be empty (up to 2000 characters).</p>
      ) : null}
      {params.error === "failed" ? <p role="alert" className="rounded border border-red-600 p-2 text-sm">Your disclosure could not be saved.</p> : null}
      <form action={saveDisclosure} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Disclosure
          <textarea name="text" required maxLength={2000} rows={6} defaultValue={disclosure?.text ?? ""} className="rounded border px-3 py-2 text-base" />
        </label>
        <button type="submit" className="self-start rounded bg-foreground px-4 py-2 text-background">
          Save disclosure
        </button>
      </form>
      <Link href="/contribute" className="text-sm underline">Back to your stories</Link>
    </main>
  );
}
