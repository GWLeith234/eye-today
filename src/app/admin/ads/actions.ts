"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { sanitizeAdHtml } from "@/lib/ads/sanitize";
import { AD_CATEGORIES, CAMPAIGN_STATUSES } from "@/lib/ads/slots";
import { getEditorContext } from "@/lib/auth/editor";
import { getSiteId } from "@/lib/site";

// Campaign dates are typed as UTC on the form.
const optionalDate = z
  .string()
  .trim()
  .transform((value, ctx) => {
    if (!value) return null;
    const date = new Date(`${value}:00Z`);
    if (Number.isNaN(date.getTime())) {
      ctx.addIssue({ code: "custom", message: "Use a valid date." });
      return z.NEVER;
    }
    return date.toISOString();
  });

const campaignSchema = z
  .object({
    advertiser_name: z.string().trim().min(1).max(120),
    name: z.string().trim().min(1).max(120),
    status: z.enum(CAMPAIGN_STATUSES),
    starts_at: optionalDate,
    ends_at: optionalDate,
    freq_cap_per_day: z
      .string()
      .trim()
      .transform((value) => (value === "" ? null : Number(value)))
      .pipe(z.number().int().min(1).max(1000).nullable()),
  })
  .refine((c) => !c.starts_at || !c.ends_at || c.ends_at > c.starts_at, { message: "The end must come after the start." });

const fields = (formData: FormData, names: string[]) => Object.fromEntries(names.map((n) => [n, String(formData.get(n) ?? "")]));
const CAMPAIGN_FIELDS = ["advertiser_name", "name", "status", "starts_at", "ends_at", "freq_cap_per_day"];

function back(path: string, query: Record<string, string>): never {
  redirect(`${path}?${new URLSearchParams(query).toString()}`);
}

export async function createCampaign(formData: FormData) {
  const ctx = await getEditorContext();
  if (!ctx) redirect("/login");
  const parsed = campaignSchema.safeParse(fields(formData, CAMPAIGN_FIELDS));
  if (!parsed.success) back("/admin/ads", { error: parsed.error.issues[0]?.message ?? "Check the campaign fields." });
  const siteId = await getSiteId(ctx.supabase);
  if (!siteId) back("/admin/ads", { error: "No site is set up yet." });

  const { data, error } = await ctx.supabase
    .from("ad_campaigns")
    .insert({ site_id: siteId, ...parsed.data })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) back("/admin/ads", { error: "The campaign could not be created." });
  redirect(`/admin/ads/${data.id}`);
}

export async function updateCampaign(formData: FormData) {
  const ctx = await getEditorContext();
  if (!ctx) redirect("/login");
  const id = z.uuid().safeParse(String(formData.get("id") ?? ""));
  if (!id.success) redirect("/admin/ads");
  const path = `/admin/ads/${id.data}`;
  const parsed = campaignSchema.safeParse(fields(formData, CAMPAIGN_FIELDS));
  if (!parsed.success) back(path, { error: parsed.error.issues[0]?.message ?? "Check the campaign fields." });

  const { error } = await ctx.supabase.from("ad_campaigns").update(parsed.data).eq("id", id.data);
  if (error) back(path, { error: "The campaign could not be saved." });
  revalidatePath(path);
  back(path, { saved: "campaign" });
}

// https only, a real host, and no credentials in the URL.
const httpsUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && url.hostname.includes(".") && !url.username && !url.password;
    } catch {
      return false;
    }
  }, "The click URL must be a full https address.");

const creativeSchema = z.object({
  campaign_id: z.uuid(),
  slot_id: z.uuid(),
  category: z.enum(AD_CATEGORIES),
  weight: z.coerce.number().int().min(1).max(100),
  click_url: httpsUrl,
  alt: z.string().trim().max(300),
  media_id: z.union([z.literal(""), z.uuid()]),
  html: z.string().max(5000),
});

// New creatives are always pending. An image or HTML, not both. HTML is sanitized before it is stored.
export async function createCreative(formData: FormData) {
  const ctx = await getEditorContext();
  if (!ctx) redirect("/login");
  const parsed = creativeSchema.safeParse(fields(formData, ["campaign_id", "slot_id", "category", "weight", "click_url", "alt", "media_id", "html"]));
  const campaignId = String(formData.get("campaign_id") ?? "");
  const path = `/admin/ads/${z.uuid().safeParse(campaignId).success ? campaignId : ""}`;
  if (!parsed.success) back(path, { error: parsed.error.issues[0]?.message ?? "Check the creative fields." });
  const input = parsed.data;

  const hasImage = input.media_id !== "";
  const hasHtml = input.html.trim() !== "";
  if (hasImage === hasHtml) back(path, { error: "Give the creative an image or HTML, not both and not neither." });
  if (hasImage && !input.alt) back(path, { error: "An image needs alt text." });

  let html: string | null = null;
  if (hasHtml) {
    const clean = sanitizeAdHtml(input.html);
    if (!clean.usable) back(path, { error: "Nothing usable is left of that HTML after cleaning. Only p, br, strong, em, a (https) and img are kept." });
    html = clean.html;
  }

  const { data: campaign } = await ctx.supabase.from("ad_campaigns").select("site_id").eq("id", input.campaign_id).maybeSingle<{ site_id: string }>();
  if (!campaign) back(path, { error: "That campaign could not be found." });

  const { error } = await ctx.supabase.from("ad_creatives").insert({
    site_id: campaign.site_id,
    campaign_id: input.campaign_id,
    slot_id: input.slot_id,
    category: input.category,
    weight: input.weight,
    click_url: input.click_url,
    alt: input.alt || null,
    media_id: hasImage ? input.media_id : null,
    html,
    status: "pending",
  });
  if (error) back(path, { error: "The creative could not be saved." });
  revalidatePath(path);
  back(path, { saved: "creative" });
}

const decisionSchema = z.object({ id: z.uuid(), campaign_id: z.uuid(), decision: z.enum(["approved", "rejected", "pending"]) });

// Approve and reject are explicit. Only an approved creative in an active campaign serves.
export async function decideCreative(formData: FormData) {
  const ctx = await getEditorContext();
  if (!ctx) redirect("/login");
  const parsed = decisionSchema.safeParse(fields(formData, ["id", "campaign_id", "decision"]));
  if (!parsed.success) redirect("/admin/ads");
  const path = `/admin/ads/${parsed.data.campaign_id}`;

  const { error } = await ctx.supabase
    .from("ad_creatives")
    .update({ status: parsed.data.decision })
    .eq("id", parsed.data.id)
    .eq("campaign_id", parsed.data.campaign_id);
  if (error) back(path, { error: "That decision could not be saved." });
  revalidatePath(path);
  back(path, { saved: parsed.data.decision });
}

const toggleSchema = z.object({ id: z.uuid(), campaign_id: z.uuid(), active: z.enum(["true", "false"]) });

export async function setCreativeActive(formData: FormData) {
  const ctx = await getEditorContext();
  if (!ctx) redirect("/login");
  const parsed = toggleSchema.safeParse(fields(formData, ["id", "campaign_id", "active"]));
  if (!parsed.success) redirect("/admin/ads");
  const path = `/admin/ads/${parsed.data.campaign_id}`;
  const { error } = await ctx.supabase
    .from("ad_creatives")
    .update({ is_active: parsed.data.active === "true" })
    .eq("id", parsed.data.id)
    .eq("campaign_id", parsed.data.campaign_id);
  if (error) back(path, { error: "The creative could not be updated." });
  revalidatePath(path);
  back(path, { saved: "creative" });
}

export async function deleteCreative(formData: FormData) {
  const ctx = await getEditorContext();
  if (!ctx) redirect("/login");
  const parsed = z.object({ id: z.uuid(), campaign_id: z.uuid() }).safeParse(fields(formData, ["id", "campaign_id"]));
  if (!parsed.success) redirect("/admin/ads");
  const path = `/admin/ads/${parsed.data.campaign_id}`;
  const { error } = await ctx.supabase.from("ad_creatives").delete().eq("id", parsed.data.id).eq("campaign_id", parsed.data.campaign_id);
  if (error) back(path, { error: "The creative could not be deleted." });
  revalidatePath(path);
  back(path, { saved: "deleted" });
}
