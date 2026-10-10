export type PollOption = { id: string; label: string; votes: number | null };

export type PollView = {
  id: string;
  question: string;
  state: "open" | "closed" | "upcoming";
  results: "after_vote" | "after_close" | "always";
  closesAt: string | null;
  options: PollOption[];
  total: number | null;
  myOption: string | null;
};

export type VoteOutcome = { ok: true; poll: PollView } | { ok: false; error: "already_voted" | "closed" | "invalid" | "limited" | "unavailable"; poll?: PollView };

export const VOTE_MESSAGES: Record<Exclude<VoteOutcome, { ok: true }>["error"], string> = {
  already_voted: "You’ve already voted in this poll.",
  closed: "This poll is closed.",
  invalid: "That vote couldn’t be counted.",
  limited: "Too many votes from here just now. Please try again later.",
  unavailable: "Voting isn’t available right now.",
};

type PublicRow = {
  id: string;
  question: string;
  state: PollView["state"];
  results: PollView["results"];
  closes_at: string | null;
  option_id: string;
  label: string;
  votes: number | null;
  total: number | null;
};
type VoterRow = { option_id: string; votes: number; total: number; my_option: string | null };

// Merge the public view with the voter's own view (counts the voter is allowed to see once they have voted).
export function buildPollView(rows: PublicRow[], voter: VoterRow[]): PollView | null {
  if (rows.length === 0) return null;
  const mine = voter[0]?.my_option ?? null;
  const counts = new Map(voter.map((row) => [row.option_id, row.votes]));
  const showVoterCounts = mine !== null && rows[0].results !== "after_close";
  return {
    id: rows[0].id,
    question: rows[0].question,
    state: rows[0].state,
    results: rows[0].results,
    closesAt: rows[0].closes_at,
    options: rows.map((row) => ({
      id: row.option_id,
      label: row.label,
      votes: row.votes ?? (showVoterCounts ? (counts.get(row.option_id) ?? 0) : null),
    })),
    total: rows[0].total ?? (showVoterCounts ? (voter[0]?.total ?? 0) : null),
    myOption: mine,
  };
}

export function percent(votes: number | null, total: number | null): number {
  if (votes === null || !total) return 0;
  return Math.round((votes / total) * 100);
}
