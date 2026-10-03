import type { Metadata } from "next";

import { DirectoryFrame } from "@/components/public/directory-frame";
import { TurnstileWidget } from "@/app/(public)/write-for-us/turnstile-widget";
import { getDirectoryCategories } from "@/lib/directory/public";

import { submitListing } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Add a listing",
  alternates: { canonical: "/directory/submit" },
};

const ERRORS: Record<string, string> = {
  invalid: "Check the name, category, two-letter country code, website and both email fields.",
  challenge: "We couldn't verify you're human. Please try the check again.",
  unavailable: "Submissions are closed right now. Please try again later.",
  failed: "Something went wrong sending the listing. Please try again.",
};

const field = "rounded border border-rule bg-paper px-3 py-2 text-base";

export default async function SubmitListingPage({ searchParams }: PageProps<"/directory/submit">) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? ERRORS[params.error] : undefined;
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const categories = await getDirectoryCategories();

  if (params.submitted === "1") {
    return (
      <DirectoryFrame>
        <h1 className="font-serif text-4xl font-bold">Thank you</h1>
        <p role="status">We&apos;ve received the listing. It stays off the public directory until an editor publishes it.</p>
      </DirectoryFrame>
    );
  }

  return (
    <DirectoryFrame>
      <h1 className="font-serif text-4xl font-bold">Add a listing</h1>
      <p className="max-w-2xl">
        Tell us about a clinic, practitioner or support service. An editor reads every submission. Nothing is published from this form, and we do not offer paid placement.
      </p>
      {error ? <p role="alert" className="rounded border border-red-600 p-3 text-sm">{error}</p> : null}
      {categories.length === 0 ? <p className="text-sm">The directory is unavailable right now.</p> : null}
      <form action={submitListing} className="grid max-w-xl gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Organisation name
          <input name="name" required maxLength={160} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Category
          <select name="category" required className={field} defaultValue="">
            <option value="" disabled>Choose a category</option>
            {categories.map((category) => (
              <option key={category.slug} value={category.slug}>{category.name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Country code
          <input name="country" required maxLength={2} minLength={2} placeholder="MX" autoCapitalize="characters" className={`${field} uppercase`} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Region
          <input name="region" maxLength={80} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          City
          <input name="city" maxLength={80} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Services
          <input name="services" maxLength={1000} placeholder="retreat, integration" className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Languages
          <input name="languages" maxLength={500} placeholder="English, Spanish" className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Website
          <input name="website" type="url" maxLength={300} placeholder="https://" className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Public email
          <input name="public_email" type="email" maxLength={254} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Public phone
          <input name="public_phone" type="tel" maxLength={40} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Description
          <textarea name="description" required maxLength={2000} rows={5} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Your email
          <input name="contact_email" type="email" required maxLength={254} autoComplete="email" className={field} />
          <span className="text-muted">Used to reach you. It is not published.</span>
        </label>
        {siteKey ? <TurnstileWidget siteKey={siteKey} action="directory_submit" /> : <p className="text-sm">Submissions are closed right now.</p>}
        <button type="submit" disabled={!siteKey || categories.length === 0} className="self-start rounded bg-ink px-4 py-2 text-paper disabled:opacity-50">
          Submit listing
        </button>
      </form>
    </DirectoryFrame>
  );
}
