import Link from "next/link";

import { adCheckoutOffered } from "@/lib/ads/prices";
import { ROS_MONTHLY_USD } from "@/lib/ads/slots";
import { requireArea } from "@/lib/auth/session";

import { createAdCampaign } from "./actions";
import { NOTICES, errorMessage } from "./messages";
import { STATUS, type CampaignRow } from "./status";

export const dynamic = "force-dynamic";

const when = (iso: string) => new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(new Date(iso));
const field = "rounded border border-rule bg-paper px-3 py-2 text-base";

export default async function AdvertisePage({ searchParams }: PageProps<"/account/advertise">) {
  const { supabase, user } = await requireArea("account");
  const params = await searchParams;
  const notice = typeof params.saved === "string" ? NOTICES[params.saved] : undefined;
  const error = errorMessage(params);

  const { data } = await supabase
    .from("ad_campaigns")
    .select("id, advertiser_name, name, status, months, starts_at, ends_at, paid_at, reject_reason, click_url")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100)
    .returns<CampaignRow[]>();
  const rows = data ?? [];

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold">Advertise</h1>
        <p className="text-sm text-muted">
          Run-of-site campaigns: your creatives rotate across every page of Eye Today for ${ROS_MONTHLY_USD} a month.{" "}
          <Link href="/advertise" className="underline">Rate card and specs</Link> · <Link href="/ad-policy" className="underline">Ad policy</Link> ·{" "}
          <Link href="/account" className="underline">Back to your account</Link>
        </p>
      </header>
      {notice ? <p role="status" className="rounded border border-green-600 p-3 text-sm">{notice}</p> : null}
      {error ? <p role="alert" className="rounded border border-red-600 p-3 text-sm">{error}</p> : null}
      {!adCheckoutOffered(process.env) ? <p className="border border-rule p-3 text-sm">Self-serve payment isn’t open yet. Build your campaign here; write to <a href="mailto:advertise@theeye.today" className="underline">advertise@theeye.today</a> and we’ll set it live by hand.</p> : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Your campaigns</h2>
        {rows.length === 0 ? <p>You haven’t started a campaign yet.</p> : null}
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <li key={row.id} data-testid="own-campaign" className="flex flex-col gap-1 border border-rule p-4 text-sm">
              <p className="font-semibold">
                <Link href={`/account/advertise/${row.id}`} className="underline">{row.name}</Link>
                <span className="ml-2 font-normal text-muted">{row.advertiser_name}</span>
              </p>
              <p>
                Status: <strong>{STATUS[row.status] ?? row.status}</strong>
                {row.months ? ` · ${row.months} month${row.months === 1 ? "" : "s"}` : ""}
                {row.starts_at && row.ends_at && row.paid_at ? ` · ${when(row.starts_at)} to ${when(row.ends_at)}` : ""}
              </p>
              {row.status === "rejected" && row.reject_reason ? <p>Editor’s note: {row.reject_reason}</p> : null}
            </li>
          ))}
        </ul>
      </section>

      <form action={createAdCampaign} className="flex flex-col gap-3 border border-rule p-4">
        <h2 className="text-xl font-semibold">Start a campaign</h2>
        <label className="flex flex-col gap-1 text-sm">
          Advertiser (the name readers see on the invoice and the report)
          <input name="advertiser_name" required maxLength={120} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Campaign name (for you)
          <input name="name" required maxLength={120} className={field} placeholder="Spring intake 2027" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Click URL (https) — where every creative sends readers
          <input type="url" name="click_url" required pattern="https://.*" maxLength={500} placeholder="https://" className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Start date (optional; otherwise the day it is approved)
          <input type="date" name="starts_at" className={field} />
        </label>
        <button type="submit" className="self-start rounded bg-ink px-4 py-2 text-paper">Create campaign</button>
        <p className="text-xs text-muted">Next: upload a creative for each unit size you want, choose how many months, and pay. An editor reviews every creative under the ad policy before it serves.</p>
      </form>
    </main>
  );
}
