import type { Metadata } from "next";
import Link from "next/link";

import { listContests, when } from "@/lib/contests/public";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Contests", alternates: { canonical: "/contests" } };

const STATE: Record<string, string> = { open: "Open", closed: "Closed", upcoming: "Opening soon" };

export default async function ContestsPage() {
  const contests = await listContests();
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <h1 className="font-serif text-4xl font-bold">Contests</h1>
      <p>Free to enter. One entry per person. Every winner is drawn at random, and the draw is recorded.</p>
      {contests.length === 0 ? <p role="status">No contests right now.</p> : null}
      <ul className="flex flex-col gap-4">
        {contests.map((contest) => (
          <li key={contest.slug} className="flex flex-col gap-1 border-t border-rule pt-4">
            <p className="text-xs font-semibold uppercase tracking-widest">{STATE[contest.state]}</p>
            <h2 className="font-serif text-xl font-semibold">
              <Link href={`/contests/${contest.slug}`} className="hover:underline">{contest.title}</Link>
            </h2>
            <p className="text-sm">Prize: {contest.prize}</p>
            <p className="text-sm text-muted">{contest.state === "closed" ? "Closed" : "Closes"} {when(contest.closes_at)}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
