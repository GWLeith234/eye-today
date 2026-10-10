"use client";

import { useEffect, useState, useTransition } from "react";

import { loadPoll, votePoll } from "@/lib/polls/actions";
import { percent, type PollView, VOTE_MESSAGES } from "@/lib/polls/types";

export function PollWidget({ pollId }: { pollId: string }) {
  const [poll, setPoll] = useState<PollView | null | undefined>(undefined);
  const [choice, setChoice] = useState<string>("");
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let live = true;
    loadPoll(pollId)
      .then((value) => live && setPoll(value))
      .catch(() => live && setPoll(null));
    return () => {
      live = false;
    };
  }, [pollId]);

  if (poll === undefined) return <p className="text-sm text-muted">Loading poll…</p>;
  if (poll === null) return null;

  const voted = poll.myOption !== null;
  const showCounts = poll.total !== null;
  const canVote = poll.state === "open" && !voted;
  const headingId = `poll-${poll.id}`;

  return (
    <section aria-labelledby={headingId} data-testid="poll" className="my-2 flex flex-col gap-3 border-2 border-ink bg-paper p-4 not-prose">
      <p className="text-xs font-semibold uppercase tracking-widest">Reader poll</p>
      <h2 id={headingId} className="font-display text-xl font-semibold">{poll.question}</h2>
      {canVote ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!choice) return;
            start(async () => {
              const outcome = await votePoll(poll.id, choice);
              if (outcome.ok) {
                setPoll(outcome.poll);
                setNote("Thanks for voting.");
              } else {
                if (outcome.poll) setPoll(outcome.poll);
                setNote(VOTE_MESSAGES[outcome.error]);
              }
            });
          }}
        >
          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">{poll.question}</legend>
            {poll.options.map((option) => (
              <label key={option.id} className="flex items-center gap-2">
                <input type="radio" name={`poll-${poll.id}`} value={option.id} checked={choice === option.id} onChange={() => setChoice(option.id)} />
                {option.label}
              </label>
            ))}
          </fieldset>
          <button type="submit" disabled={pending || !choice} className="self-start bg-ink px-4 py-2 text-sm text-paper disabled:opacity-50">
            {pending ? "Voting…" : "Vote"}
          </button>
        </form>
      ) : null}
      {showCounts ? (
        <ul className="flex flex-col gap-2" aria-label="Results">
          {poll.options.map((option) => {
            const pct = percent(option.votes, poll.total);
            return (
              <li key={option.id} className="flex flex-col gap-1 text-sm">
                <span className="flex justify-between gap-2">
                  <span>
                    {option.label}
                    {poll.myOption === option.id ? <span className="ml-2 text-xs font-semibold uppercase">Your vote</span> : null}
                  </span>
                  <span>{pct}%</span>
                </span>
                <span className="block h-2 w-full bg-rule" aria-hidden="true">
                  <span className="block h-2 bg-accent" style={{ width: `${pct}%` }} />
                </span>
              </li>
            );
          })}
          <li className="text-xs text-muted">{poll.total} {poll.total === 1 ? "vote" : "votes"}</li>
        </ul>
      ) : null}
      {!canVote && !showCounts ? (
        <p className="text-sm">
          {poll.state === "upcoming" ? "Voting hasn’t opened yet." : voted ? "Thanks for voting. Results appear when the poll closes." : "Results appear when the poll closes."}
        </p>
      ) : null}
      {note ? <p role="status" className="text-sm">{note}</p> : null}
      <p className="text-xs text-muted">One vote per reader. This is a reader poll, not a scientific survey.</p>
    </section>
  );
}
