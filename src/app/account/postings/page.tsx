import Link from "next/link";

import { requireArea } from "@/lib/auth/session";
import { POSTING_CHECKOUT_MESSAGES, type PostingCheckoutError, payable } from "@/lib/postings/checkout";
import { POSTING_FORM_ERRORS } from "@/lib/postings/form";
import { postingCheckoutOffered } from "@/lib/postings/prices";
import { BOARD, type PostingKind, type PostingStatus } from "@/lib/postings/types";

import { startPostingCheckout } from "./actions";

export const dynamic = "force-dynamic";

const NOTICES: Record<string, string> = {
  saved: "Saved.",
  paid: "Thank you. Your payment is being confirmed, and then an editor will review the posting.",
};

const STATUS: Record<PostingStatus, string> = {
  draft: "Draft (not paid)",
  pending: "Waiting for an editor",
  published: "Live",
  expired: "Ended",
  rejected: "Not approved",
};

type Row = {
  id: string;
  kind: PostingKind;
  slug: string;
  title: string;
  status: PostingStatus;
  paid_days: number;
  expires_at: string | null;
  reject_reason: string | null;
};

const when = (iso: string) => new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(new Date(iso));
// Read outside the component body: render must not call impure functions directly.
const nowMs = () => Date.now();

export default async function AccountPostingsPage({ searchParams }: PageProps<"/account/postings">) {
  const { supabase, user } = await requireArea("account");
  const params = await searchParams;
  const notice = Object.keys(NOTICES).map((key) => (params[key] === "1" ? NOTICES[key] : null)).find(Boolean);
  const errorKey = typeof params.error === "string" ? params.error : "";
  const error = POSTING_CHECKOUT_MESSAGES[errorKey as PostingCheckoutError] ?? POSTING_FORM_ERRORS[errorKey] ?? null;
  const offered = postingCheckoutOffered(process.env);
  const now = nowMs();

  const { data } = await supabase
    .from("postings")
    .select("id, kind, slug, title, status, paid_days, expires_at, reject_reason")
    .eq("poster_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100)
    .returns<Row[]>();
  const rows = data ?? [];

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold">Your postings</h1>
        <p className="text-sm text-muted">
          Jobs and classifieds you’ve created. <Link href="/account/postings/new?kind=job" className="underline">Post a job</Link> ·{" "}
          <Link href="/account/postings/new?kind=classified" className="underline">Post a classified</Link> · <Link href="/jobs/policy" className="underline">Posting policy</Link> ·{" "}
          <Link href="/account" className="underline">Back to your account</Link>
        </p>
      </header>
      {notice ? <p role="status" className="rounded border border-green-600 p-3 text-sm">{notice}</p> : null}
      {error ? <p role="alert" className="rounded border border-red-600 p-3 text-sm">{error}</p> : null}
      {!offered ? <p className="border border-rule p-3 text-sm">{POSTING_CHECKOUT_MESSAGES.not_configured}</p> : null}
      {rows.length === 0 ? <p>You haven’t created a posting yet.</p> : null}
      <ul className="flex flex-col gap-4">
        {rows.map((row) => {
          const live = row.status === "published" && row.expires_at && new Date(row.expires_at).getTime() > now;
          const ended = row.status === "expired" || (row.status === "published" && !live);
          return (
            <li key={row.id} data-testid="own-posting" className="flex flex-col gap-2 border border-rule p-4 text-sm">
              <p className="font-semibold">
                {live ? <Link href={`${BOARD[row.kind].path}/${row.slug}`} className="underline">{row.title}</Link> : row.title}
                <span className="ml-2 font-normal text-muted">{row.kind === "job" ? "Job" : "Classified"}</span>
              </p>
              <p>
                Status: <strong>{ended ? STATUS.expired : STATUS[row.status]}</strong>
                {live && row.expires_at ? ` · until ${when(row.expires_at)}` : ""}
                {row.status === "pending" && row.paid_days > 0 ? ` · ${row.paid_days} days paid` : ""}
              </p>
              {row.status === "rejected" && row.reject_reason ? <p>Editor’s note: {row.reject_reason}</p> : null}
              <div className="flex flex-wrap items-center gap-3">
                {!ended ? <Link href={`/account/postings/${row.id}`} className="underline">Edit</Link> : null}
                {offered && payable(ended ? "expired" : row.status) ? (
                  <form action={startPostingCheckout} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={row.id} />
                    <span>{row.status === "draft" || row.status === "rejected" ? "Pay and submit:" : live ? "Extend:" : "Renew:"}</span>
                    <button type="submit" name="days" value="30" className="rounded border border-rule px-3 py-1">30 days</button>
                    <button type="submit" name="days" value="60" className="rounded border border-rule px-3 py-1">60 days</button>
                  </form>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
