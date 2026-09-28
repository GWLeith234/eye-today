import type { Metadata } from "next";

import { apply } from "./actions";
import { TurnstileWidget } from "./turnstile-widget";

export const metadata: Metadata = { title: "Write for Eye Today" };

const ERRORS: Record<string, string> = {
  invalid: "Please fill in your name, a valid email and a short bio (each field has a length limit).",
  challenge: "We couldn't verify you're human. Please try the check again.",
  unavailable: "Applications are closed right now. Please try again later.",
  failed: "Something went wrong sending your application. Please try again.",
};

export default async function WriteForUsPage({ searchParams }: PageProps<"/write-for-us">) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? ERRORS[params.error] : undefined;
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  if (params.submitted === "1") {
    return (
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 p-8">
        <h1 className="text-3xl font-bold">Thank you</h1>
        <p role="status">We&apos;ve received your application. An editor will be in touch if it&apos;s a good fit.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 p-8">
      <h1 className="text-3xl font-bold">Write for Eye Today</h1>
      <p>We publish reporting, research explainers and first-person stories about eye health. Tell us about yourself.</p>
      {error ? <p role="alert" className="rounded border border-red-600 p-3 text-sm">{error}</p> : null}

      <form action={apply} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Name
          <input name="name" required maxLength={120} autoComplete="name" className="rounded border px-3 py-2 text-base" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input name="email" type="email" required maxLength={254} autoComplete="email" className="rounded border px-3 py-2 text-base" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Short bio
          <textarea name="bio" required maxLength={2000} rows={4} className="rounded border px-3 py-2 text-base" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Affiliations (employers, funders, industry ties)
          <textarea name="affiliations" maxLength={2000} rows={3} className="rounded border px-3 py-2 text-base" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Links to your work
          <textarea name="sample_links" maxLength={2000} rows={3} className="rounded border px-3 py-2 text-base" />
        </label>
        {siteKey ? <TurnstileWidget siteKey={siteKey} /> : <p className="text-sm opacity-70">Applications are closed right now.</p>}
        <button type="submit" disabled={!siteKey} className="self-start rounded bg-foreground px-4 py-2 text-background disabled:opacity-50">
          Send application
        </button>
      </form>
    </main>
  );
}
