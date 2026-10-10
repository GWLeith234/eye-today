import Link from "next/link";

import { requireArea } from "@/lib/auth/session";

type Row = { id: string; question: string; status: string; results: string; closes_at: string | null; created_at: string };

export default async function PollsAdminPage() {
  const { supabase } = await requireArea("admin");
  const { data: polls } = await supabase
    .from("polls")
    .select("id, question, status, results, closes_at, created_at")
    .order("created_at", { ascending: false })
    .limit(200)
    .returns<Row[]>();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold">Polls</h1>
        <Link href="/admin/polls/new" className="rounded bg-ink px-3 py-1.5 text-sm text-paper">New poll</Link>
      </div>
      <p className="text-sm">To put a poll in a story, open the article, click <strong>Poll</strong> in the toolbar and paste the poll’s ID.</p>
      {(polls ?? []).length === 0 ? <p className="text-sm">No polls yet.</p> : null}
      <ul className="flex flex-col gap-2">
        {(polls ?? []).map((poll) => (
          <li key={poll.id} data-poll-row={poll.id} className="flex flex-col gap-1 border border-rule p-3 text-sm">
            <p className="flex flex-wrap items-baseline gap-2">
              <Link href={`/admin/polls/${poll.id}`} className="font-semibold underline">{poll.question}</Link>
              <span className="text-muted">{poll.status}</span>
            </p>
            <p className="text-xs">ID for the article editor: <code className="select-all">{poll.id}</code></p>
          </li>
        ))}
      </ul>
    </div>
  );
}
