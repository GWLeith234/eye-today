import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { requireArea } from "@/lib/auth/session";
import { BOARD } from "@/lib/postings/types";
import { POSTING_EDIT_COLUMNS, type PostingEditRow, postingFieldValues } from "@/lib/postings/values";

import { reviewPosting } from "../actions";
import { ClaimsCheck } from "../claims-check";
import { PostingEditForm } from "../edit-form";

const ERRORS: Record<string, string> = {
  reason: "A rejection needs a reason the poster will see.",
  no_paid_time: "That posting has no paid time. Enter the number of days to approve it without payment.",
  not_published: "Only a live posting can be taken down.",
  save_failed: "The change could not be saved.",
};

const DONE: Record<string, string> = {
  approve: "Posting published.",
  reject: "Posting rejected.",
  unpublish: "Posting taken down and sent back to review.",
  edit: "Changes saved.",
};

type Extra = { paid_days: number; expires_at: string | null; contact_email: string; poster_id: string };
type Payment = { id: string; days: number; amount_cents: number | null; currency: string | null; stripe_payment_intent_id: string | null; created_at: string };

const when = (iso: string) => new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(iso));

export default async function PostingAdminPage({ params, searchParams }: PageProps<"/admin/postings/[id]">) {
  const { supabase } = await requireArea("admin");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const query = await searchParams;

  const [rowResult, payments] = await Promise.all([
    supabase.from("postings").select(`${POSTING_EDIT_COLUMNS}, paid_days, expires_at, contact_email, poster_id`).eq("id", id).maybeSingle<PostingEditRow & Extra>(),
    supabase.from("posting_payments").select("id, days, amount_cents, currency, stripe_payment_intent_id, created_at").eq("posting_id", id).order("created_at").returns<Payment[]>(),
  ]);
  const row = rowResult.data;
  if (!row) notFound();
  const { data: listing } = row.listing_id
    ? await supabase.from("directory_listings").select("slug").eq("id", row.listing_id).maybeSingle<{ slug: string }>()
    : { data: null };

  const error = typeof query.error === "string" ? ERRORS[query.error] : undefined;
  const notice = typeof query.saved === "string" ? DONE[query.saved] : undefined;
  const testMode = (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_test");

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm"><Link href="/admin/postings" className="underline">← All postings</Link></p>
      <h1 className="text-2xl font-semibold">{row.title}</h1>
      <p className="text-sm">
        {row.kind === "job" ? "Job" : "Classified"} · Status: <strong>{row.status}</strong>
        {row.paid_days > 0 ? ` · ${row.paid_days} days paid, not yet started` : ""}
        {row.expires_at ? ` · ends ${when(row.expires_at)} UTC` : ""}
        {row.status === "published" ? <> · <Link href={`${BOARD[row.kind].path}/${row.slug}`} className="underline">View</Link></> : null}
      </p>
      <p className="text-sm">Poster’s contact (private): <a href={`mailto:${row.contact_email}`} className="underline">{row.contact_email}</a></p>
      {row.reject_reason ? <p className="text-sm">Rejected: {row.reject_reason}</p> : null}
      {notice ? <p role="status" className="rounded border border-green-600 p-2 text-sm">{notice}</p> : null}
      {error ? <p role="alert" className="rounded border border-red-600 p-2 text-sm">{error}</p> : null}

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {row.status !== "published" ? (
          <form action={reviewPosting} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="id" value={row.id} />
            <input type="hidden" name="back" value="detail" />
            <input type="hidden" name="action" value="approve" />
            {/* Used only when there is neither paid time waiting nor unexpired time left; approve_posting decides. */}
            {row.paid_days === 0 ? (
              <label className="flex items-center gap-2">
                Days without payment
                <input name="comp_days" inputMode="numeric" maxLength={3} placeholder="30" className="w-16 rounded border border-rule bg-paper px-2 py-1" />
              </label>
            ) : null}
            <button type="submit" className="rounded bg-ink px-3 py-1 text-paper">Approve and publish</button>
          </form>
        ) : (
          <form action={reviewPosting}>
            <input type="hidden" name="id" value={row.id} />
            <input type="hidden" name="back" value="detail" />
            <input type="hidden" name="action" value="unpublish" />
            <button type="submit" className="rounded border border-rule px-3 py-1">Take down</button>
          </form>
        )}
        {row.status === "pending" || row.status === "draft" || row.status === "published" ? (
          <form action={reviewPosting} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="id" value={row.id} />
            <input type="hidden" name="back" value="detail" />
            <input type="hidden" name="action" value="reject" />
            <input name="reason" required maxLength={500} aria-label="Reason for rejecting" placeholder="Reason (the poster sees this)" className="rounded border border-rule bg-paper px-2 py-1" />
            <button type="submit" className="rounded border border-rule px-3 py-1">Reject</button>
          </form>
        ) : null}
      </div>

      <section aria-labelledby="payments" className="flex flex-col gap-2 text-sm">
        <h2 id="payments" className="font-semibold">Payments</h2>
        {(payments.data ?? []).length === 0 ? <p className="text-muted">None.</p> : null}
        <ul className="flex flex-col gap-1">
          {(payments.data ?? []).map((payment) => (
            <li key={payment.id}>
              {when(payment.created_at)} · {payment.days} days
              {payment.amount_cents !== null && payment.currency ? ` · ${(payment.amount_cents / 100).toFixed(2)} ${payment.currency.toUpperCase()}` : ""}
              {payment.stripe_payment_intent_id ? (
                <>
                  {" · "}
                  <a
                    href={`https://dashboard.stripe.com/${testMode ? "test/" : ""}payments/${encodeURIComponent(payment.stripe_payment_intent_id)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    Refund in Stripe
                  </a>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <ClaimsCheck id={row.id} />

      <h2 className="text-lg font-semibold">Edit</h2>
      <PostingEditForm id={row.id} kind={row.kind} values={postingFieldValues(row, listing?.slug ?? null)} />
    </div>
  );
}
