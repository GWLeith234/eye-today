import Link from "next/link";

import { requireArea } from "@/lib/auth/session";
import { BOARD, type PostingKind, type PostingStatus } from "@/lib/postings/types";

import { reviewPosting } from "./actions";

const ERRORS: Record<string, string> = {
  invalid: "That form was not valid.",
  not_found: "That posting was not found.",
  reason: "A rejection needs a reason the poster will see.",
  no_paid_time: "That posting has no paid time. Enter the number of days to approve it without payment.",
  not_published: "Only a live posting can be taken down.",
  save_failed: "The change could not be saved.",
};

const DONE: Record<string, string> = {
  approve: "Posting published.",
  reject: "Posting rejected. The poster can fix it and resubmit, or ask for a refund.",
  unpublish: "Posting taken down and sent back to review.",
};

const ORDER: PostingStatus[] = ["pending", "draft", "rejected", "published", "expired"];

type Row = {
  id: string;
  kind: PostingKind;
  slug: string;
  title: string;
  organisation: string;
  status: PostingStatus;
  paid_days: number;
  expires_at: string | null;
  created_at: string;
};

const when = (iso: string) => new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(iso));

export default async function PostingsAdminPage({ searchParams }: PageProps<"/admin/postings">) {
  const { supabase } = await requireArea("admin");
  const params = await searchParams;
  const error = typeof params.error === "string" ? ERRORS[params.error] : undefined;
  const done = typeof params.saved === "string" ? DONE[params.saved] : undefined;

  const { data } = await supabase
    .from("postings")
    .select("id, kind, slug, title, organisation, status, paid_days, expires_at, created_at")
    .order("created_at", { ascending: false })
    .limit(300)
    .returns<Row[]>();
  const rows = data ?? [];
  const groups = ORDER.map((status) => ({ status, rows: rows.filter((row) => row.status === status) })).filter((group) => group.rows.length);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Jobs and classifieds</h1>
      {error ? <p role="alert" className="rounded border border-red-600 p-2 text-sm">{error}</p> : null}
      {done ? <p role="status" className="rounded border border-green-600 p-2 text-sm">{done}</p> : null}
      {groups.length === 0 ? <p className="text-sm">No postings yet.</p> : null}
      {groups.map((group) => (
        <section key={group.status} aria-labelledby={`postings-${group.status}`} className="flex flex-col gap-2">
          <h2 id={`postings-${group.status}`} className="text-lg font-semibold capitalize">{group.status} ({group.rows.length})</h2>
          <ul className="flex flex-col gap-2">
            {group.rows.map((row) => (
              <li key={row.id} data-posting-id={row.id} className="flex flex-col gap-2 border border-rule p-3 text-sm">
                <p className="flex flex-wrap items-baseline gap-2">
                  <Link href={`/admin/postings/${row.id}`} className="font-semibold underline">{row.title}</Link>
                  <span>{row.organisation}</span>
                  <span className="text-muted">{row.kind === "job" ? "Job" : "Classified"} · created {when(row.created_at)}</span>
                  {row.paid_days > 0 ? <span className="text-muted">· {row.paid_days} days paid</span> : null}
                  {row.status === "published" && row.expires_at ? <span className="text-muted">· until {when(row.expires_at)}</span> : null}
                </p>
                {row.status === "pending" && row.paid_days > 0 ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <form action={reviewPosting}>
                      <input type="hidden" name="id" value={row.id} />
                      <input type="hidden" name="action" value="approve" />
                      <button type="submit" className="rounded bg-ink px-3 py-1 text-paper">Approve</button>
                    </form>
                    <form action={reviewPosting} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="id" value={row.id} />
                      <input type="hidden" name="action" value="reject" />
                      <input name="reason" required maxLength={500} aria-label={`Reason for rejecting ${row.title}`} placeholder="Reason (the poster sees this)" className="rounded border border-rule bg-paper px-2 py-1" />
                      <button type="submit" className="rounded border border-rule px-3 py-1">Reject</button>
                    </form>
                  </div>
                ) : null}
                {row.status === "published" ? (
                  <p><Link href={`${BOARD[row.kind].path}/${row.slug}`} className="underline">View</Link></p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
