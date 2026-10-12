import Link from "next/link";
import { notFound } from "next/navigation";

import { type BreakdownRow, breakdownTotals, ctr } from "@/lib/ads/report";
import { AD_CATEGORIES, CAMPAIGN_STATUSES } from "@/lib/ads/slots";
import { requireArea } from "@/lib/auth/session";
import { mediaUrl } from "@/lib/media/url";

import { createCreative, decideCampaign, decideCreative, deleteCreative, setCreativeActive, updateCampaign } from "../actions";

type Campaign = {
  id: string;
  advertiser_name: string;
  name: string;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  freq_cap_per_day: number | null;
  is_house: boolean;
  owner_id: string | null;
  months: number | null;
  paid_at: string | null;
  amount_cents: number | null;
  currency: string | null;
  click_url: string | null;
  reject_reason: string | null;
};

type Creative = {
  id: string;
  click_url: string;
  alt: string | null;
  weight: number;
  status: "pending" | "approved" | "rejected";
  category: string;
  is_active: boolean;
  html: string | null;
  ad_slots: { key: string } | null;
  media: { storage_path: string; alt: string | null } | null;
};

const utcInput = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 16) : "");
const btn = "rounded border px-2 py-1 text-sm";

export default async function CampaignPage({ params, searchParams }: PageProps<"/admin/ads/[id]">) {
  const { supabase } = await requireArea("admin");
  const { id } = await params;
  const query = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const [{ data: campaign }, { data: creativeRows }, { data: slots }, { data: media }, { data: daily }, { data: breakdownRows }] = await Promise.all([
    supabase
      .from("ad_campaigns")
      .select("id, advertiser_name, name, status, starts_at, ends_at, freq_cap_per_day, is_house, owner_id, months, paid_at, amount_cents, currency, click_url, reject_reason")
      .eq("id", id)
      .maybeSingle<Campaign>(),
    supabase
      .from("ad_creatives")
      .select("id, click_url, alt, weight, status, category, is_active, html, ad_slots(key), media(storage_path, alt)")
      .eq("campaign_id", id)
      .order("created_at"),
    supabase.from("ad_slots").select("id, key, name").order("key"),
    supabase.from("media").select("id, storage_path, alt").order("created_at", { ascending: false }).limit(100),
    supabase.rpc("ad_campaign_daily", { campaign: id }),
    supabase.rpc("ad_campaign_breakdown", { campaign: id }),
  ]);
  if (!campaign) notFound();
  const creatives = (creativeRows ?? []) as unknown as Creative[];
  const days = (daily ?? []) as { day: string; impressions: number; clicks: number }[];
  const breakdown = (breakdownRows ?? []) as BreakdownRow[];
  const totals = breakdownTotals(breakdown);
  const awaiting = campaign.status === "pending" && Boolean(campaign.paid_at);
  const paid = campaign.amount_cents != null ? `${(campaign.amount_cents / 100).toFixed(2)} ${(campaign.currency ?? "usd").toUpperCase()}` : null;

  return (
    <main className="flex w-full max-w-3xl flex-col gap-6 p-6">
      <p className="text-sm"><Link href="/admin/ads" className="underline">Ads</Link> / {campaign.name}</p>
      <h1 className="text-2xl font-bold">{campaign.name}</h1>
      {typeof query.error === "string" ? <p role="alert" className="rounded border border-red-600 p-3 text-sm">{query.error}</p> : null}
      {typeof query.saved === "string" ? <p role="status" className="rounded border border-green-600 p-3 text-sm">Saved ({query.saved}).</p> : null}

      {campaign.owner_id ? (
        <section aria-label="Self-serve campaign" className={`flex flex-col gap-3 rounded border p-4 ${awaiting ? "border-amber-600" : ""}`}>
          <h2 className="font-semibold">{awaiting ? "Paid · awaiting your approval" : "Self-serve campaign"}</h2>
          <p className="text-sm">
            {campaign.months ? `${campaign.months} month${campaign.months === 1 ? "" : "s"}` : "Not paid yet"}
            {paid ? ` · paid ${paid}` : ""}
            {campaign.click_url ? <> · goes to <span className="break-all">{campaign.click_url}</span></> : null}
          </p>
          {campaign.status === "rejected" && campaign.reject_reason ? <p className="text-sm">Rejected: {campaign.reject_reason}</p> : null}
          {awaiting ? (
            <div className="flex flex-wrap items-end gap-3">
              <form action={decideCampaign}>
                <input type="hidden" name="id" value={campaign.id} />
                <input type="hidden" name="decision" value="approve" />
                <input type="hidden" name="reason" value="" />
                <button type="submit" className={`${btn} bg-foreground text-background`}>Approve campaign</button>
              </form>
              <form action={decideCampaign} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="id" value={campaign.id} />
                <input type="hidden" name="decision" value="reject" />
                <label className="flex flex-col gap-1 text-sm">Reason for the advertiser
                  <input name="reason" required maxLength={500} className="rounded border px-2 py-1" />
                </label>
                <button type="submit" className={btn}>Reject</button>
              </form>
              <Link href="/admin/ads/policy" className="text-xs underline">Ad policy</Link>
            </div>
          ) : null}
          <p className="text-xs opacity-70">Approving sets the campaign active and approves its pending creatives. Each creative was size-checked on upload; look at it before approving.</p>
        </section>
      ) : campaign.is_house ? (
        <p className="text-sm opacity-70">House campaign: these creatives fill any unit with no paid creative, and never count against a reader’s frequency cap.</p>
      ) : null}

      <form action={updateCampaign} className="flex flex-col gap-3 rounded border p-4">
        <input type="hidden" name="id" value={campaign.id} />
        <h2 className="font-semibold">Campaign</h2>
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1 text-sm">Advertiser
            <input name="advertiser_name" required maxLength={120} defaultValue={campaign.advertiser_name} className="rounded border px-2 py-1" />
          </label>
          <label className="flex flex-col gap-1 text-sm">Name
            <input name="name" required maxLength={120} defaultValue={campaign.name} className="rounded border px-2 py-1" />
          </label>
          <label className="flex flex-col gap-1 text-sm">Start (UTC)
            <input type="datetime-local" name="starts_at" defaultValue={utcInput(campaign.starts_at)} className="rounded border px-2 py-1" />
          </label>
          <label className="flex flex-col gap-1 text-sm">End (UTC)
            <input type="datetime-local" name="ends_at" defaultValue={utcInput(campaign.ends_at)} className="rounded border px-2 py-1" />
          </label>
          <label className="flex flex-col gap-1 text-sm">Views per reader per day
            <input type="number" name="freq_cap_per_day" min={1} max={1000} defaultValue={campaign.freq_cap_per_day ?? ""} placeholder="No cap" className="w-28 rounded border px-2 py-1" />
          </label>
          <label className="flex flex-col gap-1 text-sm">Status
            <select name="status" defaultValue={campaign.status} className="rounded border px-2 py-1">
              {CAMPAIGN_STATUSES.map((s) => (<option key={s} value={s}>{s}</option>))}
            </select>
          </label>
        </div>
        <button type="submit" className="self-start rounded bg-foreground px-4 py-2 text-background">Save campaign</button>
        <p className="text-xs opacity-70">A creative serves only when it is approved, active, and its campaign is active and inside its dates.</p>
      </form>

      <section aria-label="Creatives" className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Creatives</h2>
        {creatives.length === 0 ? <p className="text-sm opacity-70">No creatives yet.</p> : null}
        <ul className="flex flex-col gap-3">
          {creatives.map((c) => (
            <li key={c.id} className="flex flex-col gap-2 rounded border p-3 text-sm">
              <p>
                <strong>{c.ad_slots?.key ?? "slot"}</strong> · {c.category} · weight {c.weight} ·{" "}
                <span className="font-semibold uppercase">{c.status}</span>{c.is_active ? "" : " · switched off"}
              </p>
              <p className="break-all opacity-80">Goes to {c.click_url}</p>
              {c.media ? (
                // eslint-disable-next-line @next/next/no-img-element -- Supabase Storage URL
                <img src={mediaUrl(c.media.storage_path, { width: 600 })} alt={c.alt || c.media.alt || ""} className="max-h-40 w-auto self-start" />
              ) : c.html ? (
                // Sanitized when saved. Shown in a sandbox with no permissions anyway.
                <iframe title="Creative preview" sandbox="" srcDoc={c.html} className="h-32 w-full rounded border bg-white" />
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                {c.status !== "approved" ? (
                  <form action={decideCreative}>
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="campaign_id" value={campaign.id} />
                    <input type="hidden" name="decision" value="approved" />
                    <button type="submit" className={`${btn} bg-foreground text-background`}>Approve</button>
                  </form>
                ) : null}
                {c.status !== "rejected" ? (
                  <form action={decideCreative}>
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="campaign_id" value={campaign.id} />
                    <input type="hidden" name="decision" value="rejected" />
                    <button type="submit" className={btn}>Reject</button>
                  </form>
                ) : null}
                <form action={setCreativeActive}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="campaign_id" value={campaign.id} />
                  <input type="hidden" name="active" value={String(!c.is_active)} />
                  <button type="submit" className={btn}>{c.is_active ? "Switch off" : "Switch on"}</button>
                </form>
                <form action={deleteCreative}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="campaign_id" value={campaign.id} />
                  <button type="submit" className={btn}>Delete</button>
                </form>
                {c.status === "pending" ? (
                  <Link href="/admin/ads/policy" className="text-xs underline">Check the ad policy before approving</Link>
                ) : null}
              </div>
            </li>
          ))}
        </ul>

        <form action={createCreative} className="flex flex-col gap-3 rounded border p-4">
          <input type="hidden" name="campaign_id" value={campaign.id} />
          <h3 className="font-semibold">Add a creative (starts pending)</h3>
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1 text-sm">Slot
              <select name="slot_id" required className="rounded border px-2 py-1">
                {((slots ?? []) as { id: string; key: string; name: string }[]).map((s) => (<option key={s.id} value={s.id}>{s.name} ({s.key})</option>))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">Category
              <select name="category" defaultValue="other" className="rounded border px-2 py-1">
                {AD_CATEGORIES.map((c) => (<option key={c} value={c}>{c}</option>))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">Weight
              <input type="number" name="weight" min={1} max={100} defaultValue={1} className="w-20 rounded border px-2 py-1" />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm">Click URL (https)
            <input type="url" name="click_url" required pattern="https://.*" maxLength={2000} placeholder="https://" className="rounded border px-2 py-1" />
          </label>
          <label className="flex flex-col gap-1 text-sm">Image from the media library
            <select name="media_id" defaultValue="" className="rounded border px-2 py-1">
              <option value="">None (use HTML below)</option>
              {((media ?? []) as { id: string; storage_path: string; alt: string | null }[]).map((m) => (<option key={m.id} value={m.id}>{m.alt || m.storage_path}</option>))}
            </select>
            <span className="text-xs opacity-70">Upload new images in <Link href="/admin/media" className="underline">Media</Link>.</span>
          </label>
          <label className="flex flex-col gap-1 text-sm">Alt text
            <input name="alt" maxLength={300} className="rounded border px-2 py-1" />
          </label>
          <label className="flex flex-col gap-1 text-sm">HTML instead of an image
            <textarea name="html" rows={4} maxLength={5000} className="rounded border px-2 py-1 font-mono" placeholder="<a href=&quot;https://…&quot;><img src=&quot;https://…/creative-728x90.png&quot; alt=&quot;…&quot;></a>" />
            <span className="text-xs opacity-70">Units show artwork only: give one https image at the unit&rsquo;s pixel size, optionally wrapped in a link. Text-only HTML is saved but never served.</span>
          </label>
          <button type="submit" className="self-start rounded bg-foreground px-4 py-2 text-background">Add creative</button>
        </form>
      </section>

      <section aria-label="Report" className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Report</h2>
        <p className="text-sm">
          {totals.impressions} impression{totals.impressions === 1 ? "" : "s"} · {totals.clicks} click{totals.clicks === 1 ? "" : "s"} ·{" "}
          CTR {ctr(totals.impressions, totals.clicks)} · <a href={`/admin/ads/${campaign.id}/report`} className="underline">Download events CSV</a> ·{" "}
          <a href={`/admin/ads/${campaign.id}/report?breakdown=1`} className="underline">Breakdown CSV</a>
        </p>
        <h3 className="font-semibold">By unit and page</h3>
        <table className="w-full text-left text-sm">
          <thead><tr><th className="py-1">Unit</th><th>Page</th><th>Impressions</th><th>Clicks</th><th>CTR</th></tr></thead>
          <tbody>
            {breakdown.map((r) => (
              <tr key={`${r.slot_key}-${r.page_type}`} className="border-t"><td className="py-1">{r.slot_key}</td><td>{r.page_type}</td><td>{r.impressions}</td><td>{r.clicks}</td><td>{ctr(Number(r.impressions), Number(r.clicks))}</td></tr>
            ))}
            {breakdown.length === 0 ? <tr><td colSpan={5} className="py-2 opacity-70">No events yet.</td></tr> : null}
          </tbody>
        </table>
        <h3 className="font-semibold">By day</h3>
        <table className="w-full text-left text-sm">
          <thead><tr><th className="py-1">Day (UTC)</th><th>Impressions</th><th>Clicks</th></tr></thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.day} className="border-t"><td className="py-1">{d.day}</td><td>{d.impressions}</td><td>{d.clicks}</td></tr>
            ))}
            {days.length === 0 ? <tr><td colSpan={3} className="py-2 opacity-70">No events yet.</td></tr> : null}
          </tbody>
        </table>
      </section>
    </main>
  );
}
