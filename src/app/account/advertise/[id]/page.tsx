import Link from "next/link";
import { notFound } from "next/navigation";

import { adCheckoutOffered } from "@/lib/ads/prices";
import { type BreakdownRow, breakdownTotals, ctr } from "@/lib/ads/report";
import { AD_SLOT_NAMES, MAX_CAMPAIGN_MONTHS, ROS_MONTHLY_USD, SLOT_SIZES } from "@/lib/ads/slots";
import { requireArea } from "@/lib/auth/session";
import { mediaUrl } from "@/lib/media/url";

import { deleteAdCampaign, deleteAdCreative, startAdCheckout, updateAdCampaign, uploadAdCreative } from "../actions";
import { NOTICES, errorMessage } from "../messages";
import { STATUS, type CampaignRow } from "../status";

export const dynamic = "force-dynamic";

type Creative = {
  id: string;
  alt: string | null;
  status: "pending" | "approved" | "rejected";
  ad_slots: { key: string } | null;
  media: { storage_path: string; width: number | null; height: number | null } | null;
};

const when = (iso: string) => new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(new Date(iso));
const dateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
const field = "rounded border border-rule bg-paper px-3 py-2 text-base";
const btn = "rounded border border-rule px-3 py-1.5 text-sm";

export default async function CampaignPage({ params, searchParams }: PageProps<"/account/advertise/[id]">) {
  const { supabase, user } = await requireArea("account");
  const { id } = await params;
  const query = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const [{ data: campaign }, { data: creativeRows }, { data: breakdown }] = await Promise.all([
    supabase
      .from("ad_campaigns")
      .select("id, advertiser_name, name, status, months, starts_at, ends_at, paid_at, reject_reason, click_url")
      .eq("id", id)
      .eq("owner_id", user.id)
      .maybeSingle<CampaignRow>(),
    supabase.from("ad_creatives").select("id, alt, status, ad_slots(key), media(storage_path, width, height)").eq("campaign_id", id).order("created_at"),
    supabase.rpc("ad_campaign_breakdown", { campaign: id }),
  ]);
  if (!campaign) notFound();
  const creatives = (creativeRows ?? []) as unknown as Creative[];
  const rows = (breakdown ?? []) as BreakdownRow[];
  const totals = breakdownTotals(rows);
  const editable = campaign.status === "draft" || campaign.status === "pending";
  const unpaid = campaign.status === "draft" && !campaign.paid_at;
  const notice = typeof query.saved === "string" ? NOTICES[query.saved] : query.paid === "1" ? NOTICES.paid : undefined;
  const error = errorMessage(query);
  const offered = adCheckoutOffered(process.env);
  const covered = new Set(creatives.map((c) => c.ad_slots?.key));

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-8">
      <p className="text-sm"><Link href="/account/advertise" className="underline">Advertise</Link> / {campaign.name}</p>
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold">{campaign.name}</h1>
        <p className="text-sm">
          Status: <strong data-testid="campaign-status">{STATUS[campaign.status] ?? campaign.status}</strong>
          {campaign.months ? ` · ${campaign.months} month${campaign.months === 1 ? "" : "s"}` : ""}
          {campaign.paid_at && campaign.starts_at && campaign.ends_at ? ` · ${when(campaign.starts_at)} to ${when(campaign.ends_at)}` : ""}
        </p>
        {campaign.status === "rejected" && campaign.reject_reason ? <p className="text-sm">Editor’s note: {campaign.reject_reason}</p> : null}
      </header>
      {notice ? <p role="status" className="rounded border border-green-600 p-3 text-sm">{notice}</p> : null}
      {error ? <p role="alert" className="rounded border border-red-600 p-3 text-sm">{error}</p> : null}

      <form action={updateAdCampaign} className="flex flex-col gap-3 border border-rule p-4">
        <input type="hidden" name="id" value={campaign.id} />
        <h2 className="text-xl font-semibold">Campaign</h2>
        <label className="flex flex-col gap-1 text-sm">Advertiser
          <input name="advertiser_name" required maxLength={120} defaultValue={campaign.advertiser_name} disabled={!editable} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">Campaign name
          <input name="name" required maxLength={120} defaultValue={campaign.name} disabled={!editable} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">Click URL (https)
          <input type="url" name="click_url" required pattern="https://.*" maxLength={500} defaultValue={campaign.click_url ?? ""} disabled={!editable} className={field} />
          <span className="text-xs text-muted">Changing it after upload updates the campaign; creatives already uploaded keep the address they were saved with until an editor reviews them.</span>
        </label>
        <label className="flex flex-col gap-1 text-sm">Start date
          <input type="date" name="starts_at" defaultValue={dateInput(campaign.starts_at)} disabled={!unpaid} className={field} />
          <span className="text-xs text-muted">Fixed once paid. The campaign runs for the months you buy from this date, or from approval if blank.</span>
        </label>
        {editable ? <button type="submit" className="self-start rounded bg-ink px-4 py-2 text-paper">Save campaign</button> : <p className="text-xs text-muted">A live or finished campaign can’t be edited.</p>}
      </form>

      <section aria-labelledby="creatives" className="flex flex-col gap-3">
        <h2 id="creatives" className="text-xl font-semibold">Creatives</h2>
        <p className="text-sm text-muted">One image per unit size. Each must be exactly the unit’s pixel size, JPEG, PNG, WebP or GIF, up to 1 MB. Every unit you cover is one more place the campaign appears; the leaderboard, big box and mobile banner cover most of the site.</p>
        {creatives.length === 0 ? <p className="text-sm">No creatives yet.</p> : null}
        <ul className="flex flex-col gap-3">
          {creatives.map((c) => {
            const size = c.ad_slots?.key && c.ad_slots.key in SLOT_SIZES ? SLOT_SIZES[c.ad_slots.key as keyof typeof SLOT_SIZES] : null;
            return (
              <li key={c.id} data-testid="own-creative" className="flex flex-col gap-2 border border-rule p-3 text-sm">
                <p>
                  <strong>{size?.label ?? c.ad_slots?.key}</strong>{size ? ` · ${size.width} × ${size.height}` : ""} · <span className="font-semibold uppercase">{c.status === "pending" && campaign.status === "draft" ? "awaiting payment" : c.status}</span>
                </p>
                {c.media ? (
                  // eslint-disable-next-line @next/next/no-img-element -- the advertiser's own upload, natural size
                  <img src={mediaUrl(c.media.storage_path)} alt={c.alt ?? ""} width={c.media.width ?? undefined} height={c.media.height ?? undefined} className="max-w-full self-start border border-rule" />
                ) : null}
                {editable && c.status !== "approved" ? (
                  <form action={deleteAdCreative}>
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="campaign_id" value={campaign.id} />
                    <button type="submit" className={btn}>Remove</button>
                  </form>
                ) : null}
              </li>
            );
          })}
        </ul>

        {editable ? (
          <form action={uploadAdCreative} className="flex flex-col gap-3 border border-rule p-4" encType="multipart/form-data">
            <input type="hidden" name="campaign_id" value={campaign.id} />
            <h3 className="font-semibold">Upload a creative</h3>
            <label className="flex flex-col gap-1 text-sm">Unit
              <select name="slot" required className={field} defaultValue={AD_SLOT_NAMES.find((n) => !covered.has(n)) ?? "leaderboard"}>
                {AD_SLOT_NAMES.map((name) => (
                  <option key={name} value={name}>
                    {SLOT_SIZES[name].label} — {SLOT_SIZES[name].width} × {SLOT_SIZES[name].height} ({SLOT_SIZES[name].where}){covered.has(name) ? " · uploaded" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">Image
              <input type="file" name="file" required accept="image/jpeg,image/png,image/webp,image/gif" className="text-sm" />
            </label>
            <label className="flex flex-col gap-1 text-sm">What it says (alt text)
              <input name="alt" required maxLength={300} className={field} placeholder="Transcend Clinic: medically supervised ibogaine treatment in Baja" />
            </label>
            <button type="submit" className="self-start rounded bg-ink px-4 py-2 text-paper">Upload creative</button>
          </form>
        ) : null}
      </section>

      {unpaid ? (
        <section aria-labelledby="pay" className="flex flex-col gap-3 border border-rule p-4">
          <h2 id="pay" className="text-xl font-semibold">Pay and submit for review</h2>
          <p className="text-sm">Run of site, ${ROS_MONTHLY_USD} a month, for as many months as you choose. One payment; no renewal unless you start another campaign.</p>
          {offered ? (
            <form action={startAdCheckout} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="id" value={campaign.id} />
              <label className="flex flex-col gap-1 text-sm">Months
                <select name="months" defaultValue="3" className={field}>
                  {Array.from({ length: MAX_CAMPAIGN_MONTHS }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>{m} month{m === 1 ? "" : "s"} — ${m * ROS_MONTHLY_USD}</option>
                  ))}
                </select>
              </label>
              <button type="submit" className="rounded bg-ink px-4 py-2 text-paper" disabled={creatives.length === 0}>Pay with card</button>
              {creatives.length === 0 ? <span className="text-xs text-muted">Upload at least one creative first.</span> : null}
            </form>
          ) : (
            <p className="text-sm">Self-serve payment isn’t open yet. Write to <a href="mailto:advertise@theeye.today" className="underline">advertise@theeye.today</a> with the campaign name and we’ll invoice you and set it live.</p>
          )}
          <form action={deleteAdCampaign}>
            <input type="hidden" name="id" value={campaign.id} />
            <button type="submit" className={btn}>Delete this draft</button>
          </form>
        </section>
      ) : null}

      <section aria-labelledby="report" className="flex flex-col gap-2">
        <h2 id="report" className="text-xl font-semibold">Report</h2>
        <p className="text-sm">
          {totals.impressions} impression{totals.impressions === 1 ? "" : "s"} · {totals.clicks} click{totals.clicks === 1 ? "" : "s"} · CTR {ctr(totals.impressions, totals.clicks)} ·{" "}
          <a href={`/account/advertise/${campaign.id}/report`} className="underline">Download CSV</a>
        </p>
        <table className="w-full text-left text-sm">
          <thead><tr><th className="py-1">Unit</th><th>Page</th><th>Impressions</th><th>Clicks</th><th>CTR</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.slot_key}-${r.page_type}`} className="border-t border-rule">
                <td className="py-1">{r.slot_key}</td><td>{r.page_type}</td><td>{r.impressions}</td><td>{r.clicks}</td><td>{ctr(Number(r.impressions), Number(r.clicks))}</td>
              </tr>
            ))}
            {rows.length === 0 ? <tr><td colSpan={5} className="py-2 text-muted">Nothing served yet.</td></tr> : null}
          </tbody>
        </table>
        <p className="text-xs text-muted">First-party counts: an impression is a unit at least half visible for one second; a click is a reader leaving through it. No tracking of individual readers.</p>
      </section>
    </main>
  );
}
