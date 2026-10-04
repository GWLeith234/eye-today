import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { TurnstileWidget } from "@/app/(public)/write-for-us/turnstile-widget";
import { DirectoryFrame } from "@/components/public/directory-frame";
import { getDirectoryListing } from "@/lib/directory/public";
import { SLUG_RE } from "@/lib/slug";

import { reportListing } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Report a problem", robots: { index: false } };

const ERRORS: Record<string, string> = {
  invalid: "Add your email address and tell us what is wrong (up to 2000 characters).",
  challenge: "We couldn't verify you're human. Please try the check again.",
  unavailable: "Reports are closed right now. Please try again later.",
  failed: "Something went wrong sending the report. Please try again.",
};

const field = "rounded border border-rule bg-paper px-3 py-2 text-base";

export default async function ReportListingPage({ params, searchParams }: PageProps<"/directory/listing/[slug]/report">) {
  const { slug } = await params;
  if (!SLUG_RE.test(slug)) notFound();
  const listing = await getDirectoryListing(slug);
  if (!listing) notFound();
  const query = await searchParams;
  const error = typeof query.error === "string" ? ERRORS[query.error] : null;
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  if (query.sent === "1") {
    return (
      <DirectoryFrame>
        <h1 className="font-serif text-4xl font-bold">Thank you</h1>
        <p role="status">An editor will look at your report. We may email you if we need more detail.</p>
        <p><Link href={`/directory/listing/${listing.slug}`} className="underline">Back to {listing.name}</Link></p>
      </DirectoryFrame>
    );
  }

  return (
    <DirectoryFrame>
      <h1 className="font-serif text-4xl font-bold">Report a problem with {listing.name}</h1>
      <p className="max-w-2xl">
        Tell us what is wrong or out of date. This goes to the directory editors. It is not a correction to a story, and nothing is published from this form.
      </p>
      {error ? <p role="alert" className="rounded border border-red-600 p-3 text-sm">{error}</p> : null}
      <form action={reportListing} className="grid max-w-xl gap-3">
        <input type="hidden" name="slug" value={listing.slug} />
        <label className="flex flex-col gap-1 text-sm">
          Your email
          <input name="email" type="email" required maxLength={254} autoComplete="email" className={field} />
          <span className="text-muted">Used only if we need to ask you something. It is not published.</span>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          What is wrong?
          <textarea name="reason" required maxLength={2000} rows={6} className={field} />
        </label>
        {siteKey ? <TurnstileWidget siteKey={siteKey} action="directory_report" /> : <p className="text-sm">Reports are closed right now.</p>}
        <button type="submit" disabled={!siteKey} className="self-start rounded bg-ink px-4 py-2 text-paper disabled:opacity-50">Send report</button>
      </form>
    </DirectoryFrame>
  );
}
