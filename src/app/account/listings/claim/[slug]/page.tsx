import Link from "next/link";
import { notFound } from "next/navigation";

import { CLAIM_MESSAGES, websiteHost } from "@/lib/directory/claims";
import { getDirectoryListing } from "@/lib/directory/public";
import { SLUG_RE } from "@/lib/slug";

import { confirmClaim, requestClaim, requestManualClaim } from "../../actions";

export const dynamic = "force-dynamic";

const field = "rounded border border-rule bg-paper px-3 py-2 text-base";

export default async function ClaimListingPage({ params, searchParams }: PageProps<"/account/listings/claim/[slug]">) {
  const { slug } = await params;
  if (!SLUG_RE.test(slug)) notFound();
  const listing = await getDirectoryListing(slug);
  if (!listing) notFound();
  const query = await searchParams;
  const error = typeof query.error === "string" ? CLAIM_MESSAGES[query.error] : null;
  const host = websiteHost(listing.website)?.replace(/^www\./, "") ?? null;

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-5 p-8">
      <h1 className="text-3xl font-bold">Claim {listing.name}</h1>
      <p className="text-sm text-muted">
        Claiming lets you propose corrections to this listing. An editor reviews every change, and claiming never changes its verification level.{" "}
        <Link href={`/directory/listing/${listing.slug}`} className="underline">Back to the listing</Link>
      </p>
      {error ? <p role="alert" className="rounded border border-red-600 p-3 text-sm">{error}</p> : null}
      {query.manual === "1" ? <p role="status" className="rounded border border-green-600 p-3 text-sm">An editor will review your claim. We will email you.</p> : null}

      {query.sent === "1" ? (
        <>
          <p role="status" className="rounded border border-green-600 p-3 text-sm">We sent a code to your email. It works for 30 minutes.</p>
          <form action={confirmClaim} className="flex flex-col gap-3">
            <input type="hidden" name="slug" value={listing.slug} />
            <label className="flex flex-col gap-1 text-sm">
              Code from the email
              <input name="code" required inputMode="numeric" autoComplete="one-time-code" maxLength={16} className={field} />
            </label>
            <button type="submit" className="self-start rounded bg-ink px-4 py-2 text-paper">Confirm</button>
          </form>
        </>
      ) : null}

      {host ? (
        <form action={requestClaim} className="flex flex-col gap-3">
          <input type="hidden" name="slug" value={listing.slug} />
          <label className="flex flex-col gap-1 text-sm">
            Your work email at {host}
            <input name="email" type="email" required maxLength={254} autoComplete="email" placeholder={`you@${host}`} className={field} />
          </label>
          <p className="text-sm text-muted">We email a one-time code to prove you can receive mail at the listing&apos;s own domain.</p>
          <button type="submit" className="self-start rounded bg-ink px-4 py-2 text-paper">
            {query.sent === "1" ? "Send a new code" : "Email me a code"}
          </button>
        </form>
      ) : (
        <p className="text-sm">This listing has no website on file, so a code cannot be sent. You can ask an editor to review your claim instead.</p>
      )}

      <form action={requestManualClaim} className="flex flex-col gap-2 border-t border-rule pt-4 text-sm">
        <input type="hidden" name="slug" value={listing.slug} />
        <p>No address at that domain? Ask an editor to review your claim. We will contact you at your account email.</p>
        <button type="submit" className="self-start rounded border border-ink px-3 py-1">Ask an editor</button>
      </form>
    </main>
  );
}
