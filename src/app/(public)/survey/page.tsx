import type { Metadata } from "next";

import { TurnstileWidget } from "@/app/(public)/write-for-us/turnstile-widget";
import { StaticPage } from "@/components/public/static-page";
import { SURVEY_QUESTIONS } from "@/lib/survey/model";

import { submitSurvey } from "./actions";

export const metadata: Metadata = {
  title: "What brought you here?",
  description: "Ninety seconds that shape what Eye Today covers.",
  alternates: { canonical: "/survey" },
  robots: { index: false },
};

const ERRORS: Record<string, string> = {
  empty: "Answer at least one question.",
  challenge: "The spam check did not pass. Try again.",
  unavailable: "The survey is not open right now.",
};

const field = "rounded border border-rule bg-paper px-3 py-2 text-base";

export default async function SurveyPage({ searchParams }: PageProps<"/survey">) {
  const params = await searchParams;
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const done = params.done === "1";
  const error = typeof params.error === "string" ? ERRORS[params.error] : null;

  return (
    <StaticPage title="What brought you here?">
      <div className="flex max-w-2xl flex-col gap-6 text-base">
        {done ? (
          <p role="status" className="rounded border border-green-700 p-3">
            Thank you. We read every answer, and it changes what we cover next.
          </p>
        ) : (
          <>
            <p>
              Eye Today is new, and we would like to know a little about who is reading and why. It takes around ninety seconds. Nothing here is
              required, and nothing is published.
            </p>
            {error ? <p role="alert" className="rounded border border-red-600 p-3">{error}</p> : null}
            <form action={submitSurvey} className="flex flex-col gap-5">
              {SURVEY_QUESTIONS.map((q) =>
                q.kind === "choice" ? (
                  <fieldset key={q.key} className="flex flex-col gap-2">
                    <legend className="font-semibold">{q.label}</legend>
                    {q.options.map((option) => (
                      <label key={option} className="flex items-center gap-2 text-sm">
                        <input type="radio" name={q.key} value={option} />
                        {option}
                      </label>
                    ))}
                  </fieldset>
                ) : (
                  <label key={q.key} className="flex flex-col gap-1">
                    <span className="font-semibold">{q.label}</span>
                    <textarea name={q.key} rows={3} maxLength={q.max} className={field} />
                  </label>
                ),
              )}
              <label className="flex flex-col gap-1">
                <span className="font-semibold">Your email (optional)</span>
                <input name="email" type="email" maxLength={254} className={field} />
                <span className="text-xs text-muted">Only so an editor can follow up if you say something we should ask more about. Never shared, never added to a list.</span>
              </label>
              {siteKey ? <TurnstileWidget siteKey={siteKey} action="survey" /> : <p className="text-sm">The survey is not open right now.</p>}
              <button type="submit" disabled={!siteKey} className="self-start rounded bg-ink px-4 py-2 text-paper disabled:opacity-50">
                Send my answers
              </button>
            </form>
          </>
        )}
      </div>
    </StaticPage>
  );
}
