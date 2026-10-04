import Link from "next/link";

import { requireArea } from "@/lib/auth/session";
import { countryName } from "@/lib/directory/countries";

import { acceptSubmission, approveManualClaim, approveProposal, openLegal, rejectClaim, rejectProposal, rejectSubmission, setReportStatus, updateCategory } from "./actions";

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
  claim_approved: "Claim approved. The person now manages the listing.",
  claim_rejected: "Claim rejected.",
  proposal_approved: "Change applied to the listing. Its verification level was not touched.",
  proposal_rejected: "Change rejected. The listing is unchanged.",
  report_closed: "Report closed.",
  report_open: "Report reopened.",
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

type Embedded<T> = T | T[] | null;
const one = <T,>(value: Embedded<T>): T | null => (Array.isArray(value) ? (value[0] ?? null) : value);

type ClaimRow = { id: string; email: string; method: string; status: string; created_at: string; directory_listings: Embedded<{ name: string; slug: string }> };
type ProposalRow = {
  id: string;
  status: string;
  created_at: string;
  payload: Record<string, unknown>;
  directory_listings: Embedded<Record<string, unknown> & { name: string; slug: string }>;
};
type ReportRow = { id: string; reason: string; reporter_email: string; status: string; created_at: string; directory_listings: Embedded<{ name: string; slug: string }> };
type FeatureRow = { listing_id: string; status: string; current_period_end: string | null; directory_listings: Embedded<{ name: string; slug: string }> };

const show = (value: unknown) => (Array.isArray(value) ? value.join(", ") : value === null || value === undefined || value === "" ? "(empty)" : String(value));

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

  const reportStatus = params.reports === "closed" ? "closed" : "open";

  const [claims, proposals, reports, features] = await Promise.all([
    supabase
      .from("listing_claims")
      .select("id, email, method, status, created_at, directory_listings(name, slug)")
      .in("status", ["pending"])
      .eq("method", "manual")
      .order("created_at", { ascending: false })
      .limit(50)
      .returns<ClaimRow[]>(),
    supabase
      .from("listing_edit_proposals")
      .select("id, status, created_at, payload, directory_listings(name, slug, country_code, region, city, services, languages, website, public_email, public_phone, description)")
      .eq("status", "pending")
      .order("created_at")
      .limit(50)
      .returns<ProposalRow[]>(),
    supabase
      .from("listing_reports")
      .select("id, reason, reporter_email, status, created_at, directory_listings(name, slug)")
      .eq("status", reportStatus)
      .order("created_at", { ascending: false })
      .limit(100)
      .returns<ReportRow[]>(),
    supabase
      .from("listing_features")
      .select("listing_id, status, current_period_end, directory_listings(name, slug)")
      .order("current_period_end", { ascending: false })
      .limit(100)
      .returns<FeatureRow[]>(),
  ]);

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

      <section aria-labelledby="claims-heading" className="flex flex-col gap-3">
        <h2 id="claims-heading" className="text-xl font-semibold">Claims waiting for an editor</h2>
        <p className="text-sm opacity-70">People whose email is not at the listing&apos;s domain asked an editor to confirm they run it. Approving makes them an owner. It never changes the verification level.</p>
        {(claims.data ?? []).length === 0 ? <p className="text-sm opacity-70">None.</p> : null}
        <ul className="flex flex-col gap-3">
          {(claims.data ?? []).map((claim) => {
            const listing = one(claim.directory_listings);
            return (
              <li key={claim.id} className="rounded border p-3" data-testid="manual-claim">
                <p className="font-semibold">{listing?.name ?? "Listing"}</p>
                <p className="text-sm opacity-70">{claim.email} · {new Date(claim.created_at).toISOString().slice(0, 10)}</p>
                <div className="mt-2 flex gap-2">
                  <form action={approveManualClaim}><input type="hidden" name="id" value={claim.id} /><button type="submit" className="rounded bg-foreground px-3 py-1 text-background">Approve claim</button></form>
                  <form action={rejectClaim}><input type="hidden" name="id" value={claim.id} /><button type="submit" className="rounded border px-3 py-1">Reject</button></form>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="proposals-heading" className="flex flex-col gap-3">
        <h2 id="proposals-heading" className="text-xl font-semibold">Owner changes</h2>
        <p className="text-sm opacity-70">Proposed by a verified owner. Only the fields shown can change. Verification, the note, the publisher relationship and the map position are not part of a proposal.</p>
        {(proposals.data ?? []).length === 0 ? <p className="text-sm opacity-70">None.</p> : null}
        <ul className="flex flex-col gap-3">
          {(proposals.data ?? []).map((proposal) => {
            const listing = one(proposal.directory_listings);
            return (
              <li key={proposal.id} className="rounded border p-3" data-testid="proposal">
                <p className="font-semibold">{listing?.name ?? "Listing"}</p>
                <table className="mt-1 text-sm">
                  <tbody>
                    {Object.entries(proposal.payload).map(([key, value]) => (
                      <tr key={key} className="align-top">
                        <th scope="row" className="pr-3 text-left font-semibold">{key}</th>
                        <td className="pr-3 opacity-70">{show(listing?.[key])}</td>
                        <td>→ {show(value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-2 flex gap-2">
                  <form action={approveProposal}><input type="hidden" name="id" value={proposal.id} /><button type="submit" className="rounded bg-foreground px-3 py-1 text-background">Approve change</button></form>
                  <form action={rejectProposal}><input type="hidden" name="id" value={proposal.id} /><button type="submit" className="rounded border px-3 py-1">Reject</button></form>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="reports-heading" className="flex flex-col gap-3">
        <h2 id="reports-heading" className="text-xl font-semibold">Reported problems</h2>
        <nav aria-label="Report status" className="flex gap-3 text-sm">
          <Link href="/admin/directory?reports=open" className={reportStatus === "open" ? "font-semibold underline" : "underline"}>Open</Link>
          <Link href="/admin/directory?reports=closed" className={reportStatus === "closed" ? "font-semibold underline" : "underline"}>Closed</Link>
        </nav>
        {(reports.data ?? []).length === 0 ? <p className="text-sm opacity-70">No {reportStatus} reports.</p> : null}
        <ul className="flex flex-col gap-3">
          {(reports.data ?? []).map((report) => {
            const listing = one(report.directory_listings);
            return (
              <li key={report.id} className="rounded border p-3">
                <p className="font-semibold">{listing?.name ?? "Listing"}</p>
                <p className="whitespace-pre-wrap text-sm">{report.reason}</p>
                <p className="text-sm opacity-70">{report.reporter_email} · {new Date(report.created_at).toISOString().slice(0, 10)}</p>
                <form action={setReportStatus} className="mt-2">
                  <input type="hidden" name="id" value={report.id} />
                  <button type="submit" name="status" value={report.status === "open" ? "closed" : "open"} className="rounded border px-3 py-1 text-sm">
                    {report.status === "open" ? "Close report" : "Reopen"}
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="features-heading" className="flex flex-col gap-2">
        <h2 id="features-heading" className="text-xl font-semibold">Featured listings</h2>
        {(features.data ?? []).length === 0 ? <p className="text-sm opacity-70">None.</p> : null}
        <ul className="flex flex-col gap-1 text-sm">
          {(features.data ?? []).map((feature) => (
            <li key={`${feature.listing_id}-${feature.current_period_end}`}>
              {one(feature.directory_listings)?.name ?? feature.listing_id} · {feature.status}
              {feature.current_period_end ? ` · until ${feature.current_period_end.slice(0, 10)}` : ""}
            </li>
          ))}
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
