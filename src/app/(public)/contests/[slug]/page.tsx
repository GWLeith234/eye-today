import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { TurnstileWidget } from "@/app/(public)/write-for-us/turnstile-widget";
import { getContest, when } from "@/lib/contests/public";
import { SLUG_RE } from "@/lib/slug";

import { enterContest } from "./actions";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  invalid: "Check your name and email, and tick the consent box.",
  challenge: "We couldn’t verify you’re human. Please try the check again.",
  limited: "Too many entries from here just now. Please try again later.",
  unavailable: "Entries are closed right now. Please try again later.",
  failed: "Something went wrong. Please try again.",
};

const DONE: Record<string, string> = {
  "1": "You’re entered. Good luck.",
  again: "That email is already entered. One entry per person.",
  closed: "Sorry, this contest has closed.",
};

const field = "rounded border border-rule bg-paper px-3 py-2 text-base";

export async function generateMetadata({ params }: PageProps<"/contests/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  if (!SLUG_RE.test(slug)) return {};
  const contest = await getContest(slug);
  if (!contest) return {};
  return { title: contest.title, description: `Win ${contest.prize}.`, alternates: { canonical: `/contests/${contest.slug}` } };
}

// Plain text with blank lines between paragraphs.
function Paragraphs({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/\n\s*\n/)
        .map((para) => para.trim())
        .filter(Boolean)
        .map((para, index) => (
          <p key={index} className="whitespace-pre-line">{para}</p>
        ))}
    </>
  );
}

export default async function ContestPage({ params, searchParams }: PageProps<"/contests/[slug]">) {
  const { slug } = await params;
  if (!SLUG_RE.test(slug)) notFound();
  const contest = await getContest(slug);
  if (!contest) notFound();
  const query = await searchParams;
  const error = typeof query.error === "string" ? ERRORS[query.error] : undefined;
  const done = typeof query.entered === "string" ? DONE[query.entered] : undefined;
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <p className="text-sm"><Link href="/contests" className="underline">All contests</Link></p>
      <h1 className="font-serif text-4xl font-bold">{contest.title}</h1>
      <dl className="grid gap-2 text-sm sm:grid-cols-[8rem_1fr]">
        <dt className="font-semibold">Prize</dt>
        <dd>{contest.prize}</dd>
        <dt className="font-semibold">{contest.state === "closed" ? "Closed" : "Closes"}</dt>
        <dd>{when(contest.closes_at)}</dd>
        {contest.state === "upcoming" && contest.opens_at ? (
          <>
            <dt className="font-semibold">Opens</dt>
            <dd>{when(contest.opens_at)}</dd>
          </>
        ) : null}
      </dl>
      {contest.winner_first_name ? (
        <p role="status" data-testid="contest-winner" className="border-2 border-ink p-3 font-semibold">
          Winner drawn: {contest.winner_first_name}. Congratulations, and thanks to everyone who entered.
        </p>
      ) : null}
      {contest.description ? <div className="flex flex-col gap-3"><Paragraphs text={contest.description} /></div> : null}

      {done ? <p role="status" className="rounded border border-green-600 p-3 text-sm">{done}</p> : null}
      {error ? <p role="alert" className="rounded border border-red-600 p-3 text-sm">{error}</p> : null}

      {contest.state === "open" && !done ? (
        <form action={enterContest} className="grid max-w-xl gap-3 border border-rule p-4" aria-labelledby="enter-heading">
          <h2 id="enter-heading" className="font-display text-2xl font-semibold">Enter</h2>
          <input type="hidden" name="contest" value={contest.id} />
          <input type="hidden" name="slug" value={contest.slug} />
          <label className="flex flex-col gap-1 text-sm">
            Your name
            <input name="name" required maxLength={120} autoComplete="name" className={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Email
            <input name="email" type="email" required maxLength={254} autoComplete="email" className={field} />
            <span className="text-xs text-muted">Used only to contact the winner. Never published.</span>
          </label>
          {contest.question ? (
            <label className="flex flex-col gap-1 text-sm">
              {contest.question}
              <textarea name="answer" maxLength={1000} rows={3} className={field} />
            </label>
          ) : null}
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="consent" value="yes" required className="mt-1" />
            <span>
              I have read the rules below, I meet the eligibility requirements, and I agree that Eye Today may keep my name and email to run this
              contest and contact me if I win. They are used for nothing else.
            </span>
          </label>
          {siteKey ? <TurnstileWidget siteKey={siteKey} action="contest_entry" /> : <p className="text-sm">Entries are closed right now.</p>}
          <button type="submit" disabled={!siteKey} className="self-start rounded bg-ink px-4 py-2 text-paper disabled:opacity-50">Enter the contest</button>
        </form>
      ) : null}

      <section aria-labelledby="rules-heading" className="flex flex-col gap-3 text-sm">
        <h2 id="rules-heading" className="font-display text-2xl font-semibold">Rules</h2>
        {contest.eligibility ? <p><strong>Who can enter:</strong> {contest.eligibility}</p> : null}
        <Paragraphs text={contest.rules} />
        <p>
          No purchase necessary. One entry per person. The winner is drawn at random from all eligible entries after the closing date. Each draw is recorded with
          the random seed used, so it can be checked.
        </p>
      </section>
    </div>
  );
}
