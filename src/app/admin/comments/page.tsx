import Link from "next/link";

import { requireArea } from "@/lib/auth/session";

import { approveComment, bulkModerate, rejectComment, removeComment, setSiteComments, userAction } from "./actions";

const ERRORS: Record<string, string> = {
  invalid: "That form was not valid.",
  reason: "Say why in a few words before rejecting.",
  none: "Select at least one comment.",
  not_pending: "That comment is no longer waiting for review.",
  not_published: "That comment is not published.",
  date: "Pick a date in the future.",
  save_failed: "The change could not be saved.",
};

const TABS = ["pending", "reported", "published", "rejected", "removed"] as const;
type Tab = (typeof TABS)[number];

type Row = {
  id: string;
  article_title: string;
  article_slug: string;
  section_slug: string;
  profile_id: string;
  display_name: string;
  body: string;
  status: string;
  ai_flags: { kind: string; reason: string }[] | null;
  reject_reason: string | null;
  created_at: string;
  report_count: number;
  shadow_banned: boolean;
  banned_until: string | null;
};

function banLabel(until: string | null): string | null {
  if (!until) return null;
  if (until.startsWith("infinity")) return "Banned permanently";
  return new Date(until).getTime() > Date.now() ? `Banned until ${until.slice(0, 10)}` : null;
}

export default async function CommentsAdminPage({ searchParams }: PageProps<"/admin/comments">) {
  const { supabase } = await requireArea("admin");
  const params = await searchParams;
  const tab: Tab = TABS.find((t) => t === params.tab) ?? "pending";
  const error = typeof params.error === "string" ? ERRORS[params.error] : undefined;
  const done = typeof params.done === "string" ? params.done : undefined;

  const [queue, site] = await Promise.all([
    supabase.rpc("admin_comment_queue", { p_status: tab, p_limit: 100 }),
    supabase.rpc("site_comments_enabled"),
  ]);
  const rows = (queue.data ?? []) as Row[];

  return (
    <main className="flex flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold">Comments</h1>
      {done ? (
        <p role="status" className="rounded border border-green-600 p-2 text-sm">
          {done === "bulk" ? `Done. ${params.count ?? 0} changed, ${params.skipped ?? 0} skipped because they were no longer pending.` : "Saved."}
        </p>
      ) : null}
      {error ? <p role="alert" className="rounded border border-red-600 p-2 text-sm">{error}</p> : null}

      <form action={setSiteComments} className="flex flex-wrap items-center gap-3 rounded border p-3 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="enabled" defaultChecked={site.data === true} />
          Reader comments on for the whole site (each story also needs its own checkbox)
        </label>
        <button type="submit" className="rounded border px-3 py-1">Save</button>
      </form>

      <nav aria-label="Comment queues" className="flex flex-wrap gap-3 text-sm">
        {TABS.map((t) => (
          <Link key={t} href={`/admin/comments?tab=${t}`} aria-current={t === tab ? "page" : undefined} className={t === tab ? "font-bold underline" : "underline"}>
            {t}
          </Link>
        ))}
      </nav>

      {queue.error ? <p role="alert">The queue could not be loaded.</p> : null}
      {rows.length === 0 ? <p className="text-sm opacity-70">Nothing here.</p> : null}

      <form action={bulkModerate} id="bulk" className="flex flex-col gap-3">
        {tab === "pending" && rows.length ? (
          <div className="flex flex-wrap items-end gap-2 text-sm">
            <label className="flex flex-col gap-1">
              Reason, for rejecting
              <input name="reason" maxLength={500} className="rounded border px-2 py-1" />
            </label>
            <button type="submit" name="intent" value="approve" className="rounded bg-foreground px-3 py-1 text-background">Approve selected</button>
            <button type="submit" name="intent" value="reject" className="rounded border px-3 py-1">Reject selected</button>
          </div>
        ) : null}
        <ul className="flex flex-col gap-3">
          {rows.map((row) => {
            const ban = banLabel(row.banned_until);
            return (
              <li key={row.id} className="flex flex-col gap-2 rounded border p-3" data-comment-id={row.id}>
                <div className="flex items-start gap-2">
                  {tab === "pending" ? <input type="checkbox" name="ids" value={row.id} aria-label={`Select comment by ${row.display_name}`} className="mt-1" /> : null}
                  <div className="flex min-w-0 flex-col gap-1">
                    <p className="text-sm">
                      <span className="font-semibold">{row.display_name}</span> on{" "}
                      <Link href={`/${row.section_slug}/${row.article_slug}`} className="underline">{row.article_title}</Link>
                      <span className="opacity-70"> · {row.created_at.slice(0, 16).replace("T", " ")}</span>
                    </p>
                    <p className="whitespace-pre-wrap break-words">{row.body}</p>
                    {(row.ai_flags ?? []).length > 0 ? (
                      <ul className="text-sm">
                        {(row.ai_flags ?? []).map((flag, index) => (
                          <li key={index}><span className="font-semibold uppercase">{flag.kind.replace("_", " ")}.</span> {flag.reason}</li>
                        ))}
                      </ul>
                    ) : null}
                    {row.report_count > 0 ? <p className="text-sm">Reported {row.report_count} time{row.report_count === 1 ? "" : "s"}.</p> : null}
                    {row.reject_reason ? <p className="text-sm opacity-70">Reason given: {row.reject_reason}</p> : null}
                    {row.shadow_banned ? <p className="text-sm">Shadow-banned.</p> : null}
                    {ban ? <p className="text-sm">{ban}.</p> : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </form>

      {/* Per-comment controls sit outside the bulk form: forms cannot nest. */}
      {rows.length ? (
        <section aria-labelledby="actions-heading" className="flex flex-col gap-4">
          <h2 id="actions-heading" className="text-xl font-semibold">Act on one comment</h2>
          <ul className="flex flex-col gap-4">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-col gap-2 rounded border p-3 text-sm">
                <p className="font-semibold">{row.display_name}: {row.body.slice(0, 80)}{row.body.length > 80 ? "…" : ""}</p>
                <div className="flex flex-wrap items-end gap-2">
                  {row.status === "pending" ? (
                    <>
                      <form action={approveComment}>
                        <input type="hidden" name="id" value={row.id} />
                        <button type="submit" className="rounded bg-foreground px-3 py-1 text-background">Approve</button>
                      </form>
                      <form action={rejectComment} className="flex items-end gap-2">
                        <input type="hidden" name="id" value={row.id} />
                        <label className="flex flex-col gap-1">
                          Reason
                          <input name="reason" required maxLength={500} className="rounded border px-2 py-1" />
                        </label>
                        <button type="submit" className="rounded border px-3 py-1">Reject</button>
                      </form>
                    </>
                  ) : null}
                  {row.status === "published" ? (
                    <form action={removeComment}>
                      <input type="hidden" name="id" value={row.id} />
                      <button type="submit" className="rounded border px-3 py-1">Remove</button>
                    </form>
                  ) : null}
                </div>
                <form action={userAction} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="profile_id" value={row.profile_id} />
                  <label className="flex flex-col gap-1">
                    Ban until
                    <input type="date" name="until" className="rounded border px-2 py-1" />
                  </label>
                  <button type="submit" name="intent" value="ban_until" className="rounded border px-3 py-1">Ban until date</button>
                  <button type="submit" name="intent" value="ban_forever" className="rounded border px-3 py-1">Ban permanently</button>
                  <button type="submit" name="intent" value="unban" className="rounded border px-3 py-1">Lift ban</button>
                  <button type="submit" name="intent" value="shadow" className="rounded border px-3 py-1">Shadow-ban</button>
                  <button type="submit" name="intent" value="unshadow" className="rounded border px-3 py-1">Lift shadow ban</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
