import { requireArea } from "@/lib/auth/session";

import { approveApplication, rejectApplication } from "./actions";

const DONE: Record<string, string> = {
  approved: "Approved. The applicant has been invited as a contributor.",
  approved_existing: "Approved. The applicant already had an account and is now a contributor.",
  rejected: "Application rejected.",
};

const ERRORS: Record<string, string> = {
  invalid: "Unknown application.",
  not_found: "That application was not found.",
  not_pending: "That application has already been reviewed.",
  invite_failed: "The invite could not be sent.",
  not_configured: "Invites are not configured on this server.",
  no_profile: "No profile was found for that email.",
  not_grantable: "That account already has a staff or supporter role, so it can't be made a contributor.",
  not_authorized: "Only editors and admins can review applications.",
  not_signed_in: "Your session has expired. Sign in again.",
  grant_failed: "The contributor role could not be granted.",
  update_failed: "The application could not be updated.",
  reason_required: "A reason is required to reject (up to 500 characters).",
};

type Application = {
  id: string;
  name: string;
  email: string;
  bio: string | null;
  affiliations: string | null;
  sample_links: string | null;
  status: "pending" | "approved" | "rejected";
  reject_reason: string | null;
  created_at: string;
};

export default async function ApplicationsPage({ searchParams }: PageProps<"/admin/applications">) {
  const { supabase } = await requireArea("admin");
  const params = await searchParams;
  const done = typeof params.done === "string" ? DONE[params.done] : undefined;
  const error = typeof params.error === "string" ? ERRORS[params.error] : undefined;

  const { data } = await supabase
    .from("contributor_applications")
    .select("id, name, email, bio, affiliations, sample_links, status, reject_reason, created_at")
    .order("created_at", { ascending: false })
    .limit(200)
    .returns<Application[]>();
  const rows = [...(data ?? [])].sort((a, b) => Number(b.status === "pending") - Number(a.status === "pending"));

  return (
    <main className="flex flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold">Applications</h1>
      {done ? <p role="status" className="rounded border border-green-600 p-2 text-sm">{done}</p> : null}
      {error ? <p role="alert" className="rounded border border-red-600 p-2 text-sm">{error}</p> : null}
      {rows.length === 0 ? <p className="text-sm opacity-70">No applications yet.</p> : null}

      <ul className="flex flex-col gap-4">
        {rows.map((app) => (
          <li key={app.id} className="flex flex-col gap-2 rounded border p-4" aria-label={`Application from ${app.name}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-semibold">
                {app.name} <span className="font-normal opacity-70">&lt;{app.email}&gt;</span>
              </h2>
              <span className="text-xs uppercase tracking-wide">{app.status}</span>
            </div>
            <p className="text-xs opacity-60">{new Date(app.created_at).toLocaleString()}</p>
            {app.bio ? <p className="whitespace-pre-wrap text-sm">{app.bio}</p> : null}
            {app.affiliations ? <p className="whitespace-pre-wrap text-sm"><span className="font-semibold">Affiliations:</span> {app.affiliations}</p> : null}
            {app.sample_links ? <p className="whitespace-pre-wrap break-words text-sm"><span className="font-semibold">Links:</span> {app.sample_links}</p> : null}
            {app.reject_reason ? <p className="text-sm"><span className="font-semibold">Rejected:</span> {app.reject_reason}</p> : null}

            {app.status === "pending" ? (
              <div className="flex flex-wrap items-end gap-3">
                <form action={approveApplication}>
                  <input type="hidden" name="id" value={app.id} />
                  <button type="submit" className="rounded bg-foreground px-3 py-1 text-background">Approve</button>
                </form>
                <form action={rejectApplication} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="id" value={app.id} />
                  <label className="flex flex-col gap-1 text-sm">
                    Reason
                    <input name="reason" required maxLength={500} className="rounded border px-2 py-1" />
                  </label>
                  <button type="submit" className="rounded border px-3 py-1">Reject</button>
                </form>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </main>
  );
}
