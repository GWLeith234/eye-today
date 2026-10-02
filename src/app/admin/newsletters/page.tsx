import Link from "next/link";

import { requireArea } from "@/lib/auth/session";

import { createIssue } from "./actions";

type IssueRow = {
  id: string;
  subject: string;
  status: string;
  scheduled_for: string | null;
  sent_at: string | null;
  created_at: string;
  newsletter_lists: { name: string } | null;
};

export default async function NewslettersPage({ searchParams }: PageProps<"/admin/newsletters">) {
  const { supabase } = await requireArea("admin");
  const params = await searchParams;
  const [{ data: lists }, { data: issues }] = await Promise.all([
    supabase.from("newsletter_lists").select("id, name").order("name"),
    supabase
      .from("newsletter_issues")
      .select("id, subject, status, scheduled_for, sent_at, created_at, newsletter_lists(name)")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  return (
    <main className="flex w-full max-w-3xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold">Newsletters</h1>
      {params.error ? (
        <p role="alert" className="rounded border border-red-600 p-3 text-sm">
          That issue could not be created. Try again.
        </p>
      ) : null}

      <form action={createIssue} className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          New issue for
          <select name="list_id" required className="rounded border px-2 py-1">
            {((lists ?? []) as { id: string; name: string }[]).map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="rounded bg-foreground px-4 py-2 text-background">Create issue</button>
      </form>

      <ul className="flex flex-col divide-y border-y">
        {((issues ?? []) as unknown as IssueRow[]).map((issue) => (
          <li key={issue.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
            <div>
              <Link href={`/admin/newsletters/${issue.id}`} className="font-semibold underline">{issue.subject}</Link>
              <p className="text-sm opacity-70">
                {issue.newsletter_lists?.name ?? "List"} · {issue.status}
                {issue.status === "scheduled" && issue.scheduled_for ? ` for ${new Date(issue.scheduled_for).toLocaleString()}` : ""}
                {issue.status === "sent" && issue.sent_at ? ` on ${new Date(issue.sent_at).toLocaleString()}` : ""}
              </p>
            </div>
          </li>
        ))}
        {(issues ?? []).length === 0 ? <li className="py-3 text-sm opacity-70">No issues yet.</li> : null}
      </ul>
    </main>
  );
}
