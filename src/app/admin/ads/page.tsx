import Link from "next/link";

import { CAMPAIGN_STATUSES } from "@/lib/ads/slots";
import { requireArea } from "@/lib/auth/session";

import { createCampaign } from "./actions";

type CampaignRow = {
  id: string;
  advertiser_name: string;
  name: string;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
};

export default async function AdsPage({ searchParams }: PageProps<"/admin/ads">) {
  const { supabase } = await requireArea("admin");
  const params = await searchParams;
  const { data } = await supabase
    .from("ad_campaigns")
    .select("id, advertiser_name, name, status, starts_at, ends_at")
    .order("created_at", { ascending: false })
    .limit(100);
  const campaigns = (data ?? []) as CampaignRow[];

  return (
    <main className="flex w-full max-w-3xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold">Ads</h1>
      <p className="text-sm">
        <Link href="/admin/ads/policy" className="underline">Ad policy</Link>
      </p>
      {typeof params.error === "string" ? (
        <p role="alert" className="rounded border border-red-600 p-3 text-sm">{params.error}</p>
      ) : null}

      <form action={createCampaign} className="flex flex-col gap-3 rounded border p-4">
        <h2 className="font-semibold">New campaign</h2>
        <label className="flex flex-col gap-1 text-sm">
          Advertiser name
          <input name="advertiser_name" required maxLength={120} className="rounded border px-2 py-1" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Campaign name
          <input name="name" required maxLength={120} className="rounded border px-2 py-1" />
        </label>
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Start (UTC)
            <input type="datetime-local" name="starts_at" className="rounded border px-2 py-1" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            End (UTC)
            <input type="datetime-local" name="ends_at" className="rounded border px-2 py-1" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Views per reader per day
            <input type="number" name="freq_cap_per_day" min={1} max={1000} placeholder="No cap" className="w-28 rounded border px-2 py-1" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Status
            <select name="status" defaultValue="draft" className="rounded border px-2 py-1">
              {CAMPAIGN_STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>
        <button type="submit" className="self-start rounded bg-foreground px-4 py-2 text-background">Create campaign</button>
      </form>

      <ul className="flex flex-col divide-y border-y">
        {campaigns.map((c) => (
          <li key={c.id} className="py-3">
            <Link href={`/admin/ads/${c.id}`} className="font-semibold underline">{c.name}</Link>
            <p className="text-sm opacity-70">{c.advertiser_name} · {c.status}</p>
          </li>
        ))}
        {campaigns.length === 0 ? <li className="py-3 text-sm opacity-70">No campaigns yet.</li> : null}
      </ul>
    </main>
  );
}
