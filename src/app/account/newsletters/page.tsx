import Link from "next/link";

import { requireArea } from "@/lib/auth/session";

import { unsubscribeFromList } from "./actions";

type Subscription = { id: string; list_slug: string; list_name: string; status: string };

export default async function AccountNewslettersPage({ searchParams }: PageProps<"/account/newsletters">) {
  const { supabase, user } = await requireArea("account");
  const params = await searchParams;
  // Matched on the signed-in account's confirmed email, lowercased, inside the database function.
  const { data } = await supabase.rpc("my_newsletter_subscriptions");
  const subscriptions = (data ?? []) as Subscription[];

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 p-8">
      <p className="text-sm">
        <Link href="/account" className="underline">Your account</Link> / Newsletters
      </p>
      <h1 className="text-3xl font-bold">Newsletters</h1>
      <p className="text-sm opacity-70">Subscriptions for {user.email}.</p>

      {params.unsubscribed ? (
        <p role="status" className="rounded border border-green-600 p-3 text-sm">You&apos;ve been unsubscribed.</p>
      ) : null}
      {params.error ? (
        <p role="alert" className="rounded border border-red-600 p-3 text-sm">We couldn&apos;t change that subscription. Please try again.</p>
      ) : null}

      {subscriptions.length === 0 ? (
        <p>
          You aren&apos;t subscribed to anything with this address. <Link href="/newsletter" className="underline">Sign up</Link>.
        </p>
      ) : (
        <ul className="flex flex-col divide-y border-y">
          {subscriptions.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 py-3">
              <span>
                {s.list_name}
                {s.status === "pending" ? <span className="ml-2 text-sm opacity-70">(waiting for you to confirm by email)</span> : null}
              </span>
              <form action={unsubscribeFromList}>
                <input type="hidden" name="subscriber_id" value={s.id} />
                <button type="submit" className="rounded border px-3 py-1 text-sm">Unsubscribe</button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
