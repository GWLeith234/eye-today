import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { requireArea } from "@/lib/auth/session";

import { PollForm } from "../poll-form";

type Poll = { id: string; question: string; status: string; results: string; opens_at: string | null; closes_at: string | null };
type Option = { id: string; label: string; sort: number };

const local = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 16) : "");

export default async function PollAdminPage({ params, searchParams }: PageProps<"/admin/polls/[id]">) {
  const { supabase } = await requireArea("admin");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const query = await searchParams;
  const [{ data: poll }, { data: options }] = await Promise.all([
    supabase.from("polls").select("id, question, status, results, opens_at, closes_at").eq("id", id).maybeSingle<Poll>(),
    supabase.from("poll_options").select("id, label, sort").eq("poll_id", id).order("sort").returns<Option[]>(),
  ]);
  if (!poll) notFound();
  // At most six head-only counts.
  const tallies = await Promise.all(
    (options ?? []).map(async (option) => {
      const { count } = await supabase.from("poll_votes").select("id", { count: "exact", head: true }).eq("option_id", option.id);
      return [option.id, count ?? 0] as const;
    }),
  );
  const counts = new Map(tallies);
  const total = tallies.reduce((sum, [, n]) => sum + n, 0);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm"><Link href="/admin/polls" className="underline">← All polls</Link></p>
      <h1 className="text-2xl font-semibold">{poll.question}</h1>
      <p className="text-sm">ID for the article editor: <code className="select-all">{poll.id}</code></p>
      <section aria-labelledby="poll-results" className="flex flex-col gap-1 text-sm">
        <h2 id="poll-results" className="font-semibold">Results ({total} votes)</h2>
        <ul>
          {(options ?? []).map((option) => (
            <li key={option.id}>{option.label}: {counts.get(option.id) ?? 0}</li>
          ))}
        </ul>
      </section>
      <PollForm
        id={poll.id}
        question={poll.question}
        status={poll.status}
        results={poll.results}
        opensAt={local(poll.opens_at)}
        closesAt={local(poll.closes_at)}
        options={(options ?? []).map((option) => ({ id: option.id, label: option.label }))}
        notice={query.saved === "1" ? "Poll saved." : undefined}
      />
    </div>
  );
}
