import { createClient } from "@supabase/supabase-js";

// Service-role access for test setup and checks against the local stack only.
export function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed for this test");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

type Admin = ReturnType<typeof adminClient>;

export async function categoryId(admin: Admin, slug = "treatment-clinic"): Promise<string> {
  const { data, error } = await admin.from("directory_categories").select("id").eq("slug", slug).limit(1).maybeSingle<{ id: string }>();
  if (error || !data) throw new Error(`category ${slug} is not seeded`);
  return data.id;
}

export async function siteId(admin: Admin): Promise<string> {
  const { data, error } = await admin.from("sites").select("id").eq("slug", "eyetoday").maybeSingle<{ id: string }>();
  if (error || !data) throw new Error("the eyetoday site is not seeded");
  return data.id;
}

export type ListingSeed = {
  slug: string;
  name: string;
  country: string;
  city?: string;
  website?: string | null;
  level?: "listed" | "verified" | "medically_supervised";
  lat?: number;
  lng?: number;
};

export async function insertListing(admin: Admin, seed: ListingSeed): Promise<string> {
  const { data, error } = await admin
    .from("directory_listings")
    .insert({
      site_id: await siteId(admin),
      category_id: await categoryId(admin),
      slug: seed.slug,
      name: seed.name,
      country_code: seed.country,
      city: seed.city ?? "Tulum",
      website: seed.website ?? null,
      description: "A listing created by an end-to-end test.",
      status: "published",
      verification_level: seed.level ?? "verified",
      verification_note: "Checked by the test.",
      lat: seed.lat ?? null,
      lng: seed.lng ?? null,
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) throw new Error(`could not insert ${seed.slug}: ${error?.message}`);
  return data.id;
}

export async function removeListings(admin: Admin, slugPrefix: string) {
  await admin.from("directory_listings").delete().like("slug", `${slugPrefix}%`);
}

// Pauses every active, non-house campaign that holds a creative for the given unit, so a test selling that unit
// is the only paid rotation there. Tests for different units run alongside each other untouched.
export async function parkPaidCampaignsOn(admin: Admin, slotKey: string): Promise<void> {
  const { data: slot } = await admin.from("ad_slots").select("id").eq("key", slotKey).limit(1).maybeSingle<{ id: string }>();
  if (!slot) return;
  const { data: creatives } = await admin.from("ad_creatives").select("campaign_id").eq("slot_id", slot.id);
  const ids = Array.from(new Set(((creatives ?? []) as { campaign_id: string }[]).map((c) => c.campaign_id)));
  if (ids.length === 0) return;
  await admin.from("ad_campaigns").update({ status: "paused" }).in("id", ids).eq("status", "active").eq("is_house", false);
}
