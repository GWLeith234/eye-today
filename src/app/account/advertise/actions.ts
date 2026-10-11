"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { runAdCheckout } from "@/lib/ads/checkout";
import { isAdSlotName, SLOT_SIZES } from "@/lib/ads/slots";
import { requireArea } from "@/lib/auth/session";
import { rateLimit } from "@/lib/http/rate-limit";
import { EXTENSION_FOR, readDimensions, sniffRaster } from "@/lib/media/sniff";
import { getStripe } from "@/lib/membership/stripe";
import { getSiteId } from "@/lib/site";

// An advertiser's own campaigns. Everything runs as the signed-in user under RLS: they can only read,
// write or pay for campaigns that carry their owner_id, and only while draft or pending.

const MAX_CREATIVE_BYTES = 1_000_000;

const httpsUrl = z
  .string()
  .trim()
  .max(500)
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && url.hostname.includes(".") && !url.username && !url.password;
    } catch {
      return false;
    }
  }, "invalid_url");

const campaignSchema = z.object({
  advertiser_name: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(120),
  click_url: httpsUrl,
  starts_at: z
    .string()
    .trim()
    .transform((value) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : null)),
});

const field = (formData: FormData, name: string) => String(formData.get(name) ?? "");
const fields = (formData: FormData, names: string[]) => Object.fromEntries(names.map((n) => [n, field(formData, n)]));
const CAMPAIGN_FIELDS = ["advertiser_name", "name", "click_url", "starts_at"];

function back(path: string, query: Record<string, string>): never {
  redirect(`${path}?${new URLSearchParams(query).toString()}`);
}

export async function createAdCampaign(formData: FormData) {
  const { supabase, user } = await requireArea("account");
  if (!rateLimit(`ad-campaign:${user.id}`, 20, 60 * 60 * 1000)) back("/account/advertise", { error: "limited" });
  const parsed = campaignSchema.safeParse(fields(formData, CAMPAIGN_FIELDS));
  if (!parsed.success) back("/account/advertise", { error: parsed.error.issues[0]?.message === "invalid_url" ? "invalid_url" : "invalid" });
  const siteId = await getSiteId(supabase);
  if (!siteId) back("/account/advertise", { error: "failed" });

  const { data, error } = await supabase
    .from("ad_campaigns")
    .insert({ site_id: siteId, owner_id: user.id, status: "draft", ...parsed.data })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) {
    console.error("ad campaign create failed", error?.code);
    back("/account/advertise", { error: "failed" });
  }
  redirect(`/account/advertise/${data.id}?saved=campaign`);
}

export async function updateAdCampaign(formData: FormData) {
  const { supabase, user } = await requireArea("account");
  const id = z.uuid().safeParse(field(formData, "id"));
  if (!id.success) redirect("/account/advertise");
  const path = `/account/advertise/${id.data}`;
  const parsed = campaignSchema.safeParse(fields(formData, CAMPAIGN_FIELDS));
  if (!parsed.success) back(path, { error: parsed.error.issues[0]?.message === "invalid_url" ? "invalid_url" : "invalid" });

  // RLS limits this to the caller's own draft or pending campaign; a paid campaign keeps its dates.
  const { data: current } = await supabase.from("ad_campaigns").select("paid_at").eq("id", id.data).eq("owner_id", user.id).maybeSingle<{ paid_at: string | null }>();
  if (!current) back(path, { error: "not_yours" });
  const changes = current.paid_at ? { advertiser_name: parsed.data.advertiser_name, name: parsed.data.name, click_url: parsed.data.click_url } : parsed.data;
  const { error } = await supabase.from("ad_campaigns").update(changes).eq("id", id.data).eq("owner_id", user.id);
  if (error) back(path, { error: "failed" });
  revalidatePath(path);
  back(path, { saved: "campaign" });
}

export async function deleteAdCampaign(formData: FormData) {
  const { supabase, user } = await requireArea("account");
  const id = z.uuid().safeParse(field(formData, "id"));
  if (!id.success) redirect("/account/advertise");
  const { error } = await supabase.from("ad_campaigns").delete().eq("id", id.data).eq("owner_id", user.id).eq("status", "draft");
  if (error) back(`/account/advertise/${id.data}`, { error: "failed" });
  revalidatePath("/account/advertise");
  back("/account/advertise", { saved: "deleted" });
}

// One creative per upload: the file is sniffed, its pixel size must equal the unit's, it is stored
// under ads/<user>/ in the media bucket, registered in media, then attached to the campaign as pending.
export async function uploadAdCreative(formData: FormData) {
  const { supabase, user } = await requireArea("account");
  const campaignId = z.uuid().safeParse(field(formData, "campaign_id"));
  if (!campaignId.success) redirect("/account/advertise");
  const path = `/account/advertise/${campaignId.data}`;
  if (!rateLimit(`ad-creative:${user.id}`, 60, 60 * 60 * 1000)) back(path, { error: "limited" });

  const slot = field(formData, "slot");
  if (!isAdSlotName(slot)) back(path, { error: "invalid" });
  const alt = field(formData, "alt").trim();
  if (!alt || alt.length > 300) back(path, { error: "alt" });
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) back(path, { error: "file_missing" });
  if (file.size > MAX_CREATIVE_BYTES) back(path, { error: "file_too_large" });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffRaster(bytes);
  const dimensions = type ? readDimensions(bytes) : null;
  if (!type || !dimensions) back(path, { error: "file_type" });
  const size = SLOT_SIZES[slot];
  if (dimensions.width !== size.width || dimensions.height !== size.height) back(path, { error: "file_size", slot });

  const [{ data: campaign }, { data: slotRow }] = await Promise.all([
    supabase.from("ad_campaigns").select("site_id, status, click_url").eq("id", campaignId.data).eq("owner_id", user.id).maybeSingle<{ site_id: string; status: string; click_url: string | null }>(),
    supabase.from("ad_slots").select("id").eq("key", slot).maybeSingle<{ id: string }>(),
  ]);
  if (!campaign || !slotRow) back(path, { error: "not_yours" });
  if (campaign.status !== "draft" && campaign.status !== "pending") back(path, { error: "locked" });
  if (!campaign.click_url) back(path, { error: "no_click_url" });
  // Equal rotation: one creative per unit per campaign (the database trigger enforces it too).
  const { count: existing } = await supabase.from("ad_creatives").select("id", { count: "exact", head: true }).eq("campaign_id", campaignId.data).eq("slot_id", slotRow.id);
  if (existing) back(path, { error: "unit_taken", slot });

  const objectPath = `ads/${user.id}/${crypto.randomUUID()}.${EXTENSION_FOR[type]}`;
  const bucket = supabase.storage.from("media");
  const { error: uploadError } = await bucket.upload(objectPath, bytes, { contentType: type, cacheControl: "31536000" });
  if (uploadError) {
    console.error("ad creative upload failed", uploadError.message);
    back(path, { error: "failed" });
  }

  const { data: media, error: mediaError } = await supabase
    .from("media")
    .insert({ site_id: campaign.site_id, storage_path: objectPath, owner_id: user.id, alt, credit: null, caption: null, ...dimensions })
    .select("id")
    .single<{ id: string }>();
  if (mediaError || !media) {
    await bucket.remove([objectPath]);
    console.error("ad creative media insert failed", mediaError?.code);
    back(path, { error: "failed" });
  }

  const { error } = await supabase.from("ad_creatives").insert({
    site_id: campaign.site_id,
    campaign_id: campaignId.data,
    slot_id: slotRow.id,
    media_id: media.id,
    click_url: campaign.click_url,
    alt,
    category: "clinic",
    weight: 1,
    status: "pending",
  });
  if (error) {
    await bucket.remove([objectPath]);
    console.error("ad creative insert failed", error.code, error.message);
    back(path, { error: error.code === "23514" ? "file_size" : error.code === "23505" ? "unit_taken" : "failed", slot });
  }
  revalidatePath(path);
  back(path, { saved: "creative" });
}

export async function deleteAdCreative(formData: FormData) {
  const { supabase, user } = await requireArea("account");
  const parsed = z.object({ id: z.uuid(), campaign_id: z.uuid() }).safeParse(fields(formData, ["id", "campaign_id"]));
  if (!parsed.success) redirect("/account/advertise");
  const path = `/account/advertise/${parsed.data.campaign_id}`;
  // RLS allows this only for the owner's own unapproved creative; the media row and file stay.
  const { error, count } = await supabase.from("ad_creatives").delete({ count: "exact" }).eq("id", parsed.data.id).eq("campaign_id", parsed.data.campaign_id);
  if (error || !count) back(path, { error: "failed" });
  void user;
  revalidatePath(path);
  back(path, { saved: "deleted" });
}

export async function startAdCheckout(formData: FormData) {
  const { supabase, user } = await requireArea("account");
  const id = z.uuid().safeParse(field(formData, "id"));
  if (!id.success) redirect("/account/advertise");
  const path = `/account/advertise/${id.data}`;
  if (!rateLimit(`ad-checkout:${user.id}`, 10, 10 * 60 * 1000)) back(path, { error: "failed" });

  const stripe = getStripe();
  const outcome = stripe
    ? await runAdCheckout(
        {
          env: process.env,
          userId: user.id,
          email: user.email ?? null,
          campaignId: id.data,
          loadCampaign: async () => {
            const { data } = await supabase
              .from("ad_campaigns")
              .select("status, paid_at, ad_creatives(count)")
              .eq("id", id.data)
              .eq("owner_id", user.id)
              .maybeSingle<{ status: string; paid_at: string | null; ad_creatives: { count: number }[] }>();
            return data ? { status: data.status, paid_at: data.paid_at, creatives: data.ad_creatives?.[0]?.count ?? 0 } : null;
          },
          createSession: async (params) => (await stripe.checkout.sessions.create(params)).url,
        },
        field(formData, "months"),
      )
    : ({ ok: false, error: "not_configured" } as const);

  if (!outcome.ok) back(path, { error: outcome.error });
  redirect(outcome.url);
}
