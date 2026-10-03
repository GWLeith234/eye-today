import Link from "next/link";

import { requireArea } from "@/lib/auth/session";
import { countryName } from "@/lib/directory/countries";

import { acceptSubmission, openLegal, rejectSubmission, updateCategory } from "./actions";

const ERRORS: Record<string, string> = {
  invalid: "That form was not valid.",
  not_found: "That submission was not found.",
  not_pending: "That submission has already been reviewed.",
  no_category: "The category on that submission is no longer available.",
  save_failed: "The change could not be saved.",
};

const DONE: Record<string, string> = {
  category: "Category saved.",
  rejected: "Submission rejected. It was not published.",
};

type ListingRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  country_code: string;
  verification_level: string;
  directory_categories: { name: string } | { name: string }[] | null;
};

type SubmissionRow = {
  id: string;
  contact_email: string;
  status: string;
  payload: { name?: string; country_code?: string; category_slug?: string } | null;
  created_at: string;
};

type CategoryRow = { id: string; slug: string; name: string; sort: number; hidden: boolean };

type LegalRow = { country_code: string; title: string; status: string; as_of: string | null };

function categoryName(row: ListingRow): string {
  const category = row.directory_categories;
  if (!category) return "";
  return Array.isArray(category) ? category[0]?.name ?? "" : category.name;
}

export default async function DirectoryAdminPage({ searchParams }: PageProps<"/admin/directory">) {
  const { supabase } = await requireArea("admin");
  const params = await searchParams;
  const status = typeof params.status === "string" ? params.status : "";
  const error = typeof params.error === "string" ? ERRORS[params.error] : undefined;
  const done = typeof params.saved === "string" ? DONE[params.saved] : undefined;

  let listingsQuery = supabase
    .from("directory_listings")
    .select("id, name, slug, status, country_code, verification_level, directory_categories(name)")
    .order("name")
    .limit(200);
  if (status === "draft" || status === "pending" || status === "published" || status === "unpublished") {
    listingsQuery = listingsQuery.eq("status", status);
  }

  const [listings, submissions, categories, legal] = await Promise.all([
    listingsQuery.returns<ListingRow[]>(),
    supabase
      .from("listing_submissions")
      .select("id, contact_email, status, payload, created_at")
      .order("created_at", { ascending: false })
      .limit(100)
      .returns<SubmissionRow[]>(),
    supabase.from("directory_categories").select("id, slug, name, sort, hidden").order("sort").returns<CategoryRow[]>(),
    supabase.from("country_legal_status").select("country_code, title, status, as_of").order("country_code").returns<LegalRow[]>(),
  ]);

  return (
    <main className="flex flex-col gap-8 p-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold">Directory</h1>
        <Link href="/admin/directory/new" className="underline">New listing</Link>
      </header>
      {done ? <p role="status" className="rounded border border-green-600 p-2 text-sm">{done}</p> : null}
      {error ? <p role="alert" className="rounded border border-red-600 p-2 text-sm">{error}</p> : null}

      <section aria-labelledby="submissions-heading" className="flex flex-col gap-3">
        <h2 id="submissions-heading" className="text-xl font-semibold">Submissions</h2>
        {(submissions.data ?? []).length === 0 ? <p className="text-sm opacity-70">No submissions.</p> : null}
        <ul className="flex flex-col gap-3">
          {(submissions.data ?? []).map((submission) => {
            const name = submission.payload?.name || "Untitled";
            return (
              <li key={submission.id} className="rounded border p-3">
                <p className="font-semibold">{name}</p>
                <p className="text-sm opacity-70">
                  {submission.status} · {submission.payload?.country_code} · {submission.payload?.category_slug} · {submission.contact_email}
                </p>
                {submission.status === "pending" ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <form action={acceptSubmission}>
                      <input type="hidden" name="id" value={submission.id} />
                      <button type="submit" className="rounded bg-foreground px-3 py-1 text-background">Create draft for {name}</button>
                    </form>
                    <form action={rejectSubmission}>
                      <input type="hidden" name="id" value={submission.id} />
                      <button type="submit" className="rounded border px-3 py-1">Reject</button>
                    </form>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="listings-heading" className="flex flex-col gap-3">
        <h2 id="listings-heading" className="text-xl font-semibold">Listings</h2>
        <form method="get" className="flex flex-wrap items-end gap-2 text-sm">
          <label className="flex flex-col gap-1">
            Status
            <select name="status" defaultValue={status} className="rounded border px-2 py-1">
              <option value="">All</option>
              <option value="draft">draft</option>
              <option value="pending">pending</option>
              <option value="published">published</option>
              <option value="unpublished">unpublished</option>
            </select>
          </label>
          <button type="submit" className="rounded border px-3 py-1">Filter</button>
        </form>
        <ul className="flex flex-col gap-2">
          {(listings.data ?? []).map((listing) => (
            <li key={listing.id}>
              <Link href={`/admin/directory/${listing.id}`} className="underline">{listing.name}</Link>
              <span className="text-sm opacity-70">
                {" "}· {listing.status} · {listing.verification_level} · {listing.country_code} · {categoryName(listing)}
              </span>
            </li>
          ))}
        </ul>
        {(listings.data ?? []).length === 0 ? <p className="text-sm opacity-70">No listings.</p> : null}
      </section>

      <section aria-labelledby="categories-heading" className="flex flex-col gap-3">
        <h2 id="categories-heading" className="text-xl font-semibold">Categories</h2>
        <ul className="flex flex-col gap-3">
          {(categories.data ?? []).map((category) => (
            <li key={category.id}>
              <form action={updateCategory} className="flex flex-wrap items-end gap-2 text-sm">
                <input type="hidden" name="id" value={category.id} />
                <label className="flex flex-col gap-1">
                  Name
                  <input name="name" defaultValue={category.name} required maxLength={80} className="rounded border px-2 py-1" />
                </label>
                <label className="flex flex-col gap-1">
                  Sort
                  <input name="sort" type="number" defaultValue={category.sort} className="w-20 rounded border px-2 py-1" />
                </label>
                <label className="flex flex-col gap-1">
                  Visibility
                  <select name="hidden" defaultValue={category.hidden ? "yes" : "no"} className="rounded border px-2 py-1">
                    <option value="no">Shown</option>
                    <option value="yes">Hidden</option>
                  </select>
                </label>
                <button type="submit" className="rounded border px-3 py-1">Save category</button>
                <span className="text-xs opacity-60">{category.slug}</span>
              </form>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="legal-heading" className="flex flex-col gap-3">
        <h2 id="legal-heading" className="text-xl font-semibold">Legal status</h2>
        <p className="text-sm opacity-70">Starter rows are empty drafts. Publishing them needs text you write.</p>
        <ul className="flex flex-col gap-1 text-sm">
          {(legal.data ?? []).map((row) => (
            <li key={row.country_code}>
              <Link href={`/admin/directory/legal/${row.country_code}`} className="underline">
                {countryName(row.country_code)} ({row.country_code})
              </Link>
              <span className="opacity-70"> · {row.status}{row.title ? ` · ${row.title}` : ""}</span>
            </li>
          ))}
        </ul>
        <form action={openLegal} className="flex flex-wrap items-end gap-2 text-sm">
          <label className="flex flex-col gap-1">
            Country code
            <input name="code" required minLength={2} maxLength={2} placeholder="MX" className="rounded border px-2 py-1 uppercase" />
          </label>
          <button type="submit" className="rounded border px-3 py-1">Open country</button>
        </form>
      </section>
    </main>
  );
}
