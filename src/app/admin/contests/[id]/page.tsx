import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { requireArea } from "@/lib/auth/session";

import { drawWinner } from "../actions";
import { ContestForm, type ContestValues } from "../contest-form";

const ERRORS: Record<string, string> = {
  not_closed: "Draw a winner only after the contest has closed.",
  no_entries: "There are no entries to draw from.",
  draw_failed: "The draw could not be recorded.",
};

const DONE: Record<string, string> = { "1": "Contest saved.", drawn: "Winner drawn and recorded." };

type Contest = Omit<ContestValues, "question" | "opens_at" | "closes_at"> & { question: string | null; opens_at: string | null; closes_at: string };
type Draw = { id: string; seed: string; entry_count: number; drawn_at: string; contest_entries: { name: string; email: string } | { name: string; email: string }[] | null };

const local = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 16) : "");

export default async function ContestAdminPage({ params, searchParams }: PageProps<"/admin/contests/[id]">) {
  const { supabase } = await requireArea("admin");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const query = await searchParams;

  const [{ data: contest }, entries, { data: draws }] = await Promise.all([
    supabase.from("contests").select("id, slug, title, description, prize, rules, eligibility, question, status, opens_at, closes_at").eq("id", id).maybeSingle<Contest>(),
    supabase.from("contest_entries").select("id", { count: "exact", head: true }).eq("contest_id", id),
    supabase.from("contest_draws").select("id, seed, entry_count, drawn_at, contest_entries(name, email)").eq("contest_id", id).order("drawn_at", { ascending: false }).returns<Draw[]>(),
  ]);
  if (!contest) notFound();
  const error = typeof query.error === "string" ? ERRORS[query.error] : undefined;
  const notice = typeof query.saved === "string" ? DONE[query.saved] : undefined;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm"><Link href="/admin/contests" className="underline">← All contests</Link></p>
      <h1 className="text-2xl font-semibold">{contest.title}</h1>
      <p className="text-sm">
        {entries.count ?? 0} entries · <a href={`/admin/contests/${contest.id}/entries.csv`} className="underline">Download entries (CSV)</a>
        {contest.status !== "draft" ? <> · <Link href={`/contests/${contest.slug}`} className="underline">View page</Link></> : null}
      </p>
      {error ? <p role="alert" className="rounded border border-red-600 p-2 text-sm">{error}</p> : null}

      <section aria-labelledby="draws" className="flex flex-col gap-2 border border-rule p-3 text-sm">
        <h2 id="draws" className="font-semibold">Winner draw</h2>
        <p className="text-muted">Picks one entry at random after the contest closes and records the seed, so the draw can be checked. Drawing again adds a new record (for example if a winner can’t be reached).</p>
        <form action={drawWinner}>
          <input type="hidden" name="id" value={contest.id} />
          <button type="submit" className="rounded bg-ink px-3 py-1 text-paper">Draw a winner</button>
        </form>
        <ul className="flex flex-col gap-1" data-testid="draw-history">
          {(draws ?? []).map((draw) => {
            const winner = Array.isArray(draw.contest_entries) ? draw.contest_entries[0] : draw.contest_entries;
            return (
              <li key={draw.id}>
                {new Date(draw.drawn_at).toISOString().slice(0, 16).replace("T", " ")} UTC · winner <strong>{winner?.name}</strong> ({winner?.email}) of {draw.entry_count} entries ·
                seed <code className="break-all text-xs">{draw.seed}</code>
              </li>
            );
          })}
        </ul>
      </section>

      {notice ? <p role="status" className="rounded border border-green-600 p-2 text-sm">{notice}</p> : null}
      <h2 className="text-lg font-semibold">Edit</h2>
      <ContestForm
        values={{
          id: contest.id,
          slug: contest.slug,
          title: contest.title,
          description: contest.description,
          prize: contest.prize,
          rules: contest.rules,
          eligibility: contest.eligibility,
          question: contest.question ?? "",
          status: contest.status,
          opens_at: local(contest.opens_at),
          closes_at: local(contest.closes_at),
        }}
      />
    </div>
  );
}
