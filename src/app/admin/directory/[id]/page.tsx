import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { requireArea } from "@/lib/auth/session";
import type { ListingStatus, VerificationLevel } from "@/lib/directory/types";
import { isVerificationLevel, LISTING_STATUSES } from "@/lib/directory/types";

import { ListingForm, type ListingFormValue } from "../listing-form";

type ListingRow = {
  id: string;
  name: string;
  slug: string;
  category_id: string;
  country_code: string;
  region: string | null;
  city: string | null;
  services: string[] | null;
  languages: string[] | null;
  website: string | null;
  public_email: string | null;
  public_phone: string | null;
  description: string;
  logo_media_id: string | null;
  photo_media_ids: string[] | null;
  verification_level: string;
  verification_note: string;
  relationship_disclosure: string | null;
  last_reviewed_at: string | null;
  status: string;
};

function isStatus(value: string): value is ListingStatus {
  return (LISTING_STATUSES as readonly string[]).includes(value);
}

export default async function EditListingPage({ params, searchParams }: PageProps<"/admin/directory/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { supabase } = await requireArea("admin");
  const query = await searchParams;
  const notice = query.saved === "1" ? "Saved." : query.created === "1" ? "Draft created from the submission. It is not public until you publish it." : undefined;

  const [listingResult, noteResult, categories, media] = await Promise.all([
    supabase
      .from("directory_listings")
      .select("id, name, slug, category_id, country_code, region, city, services, languages, website, public_email, public_phone, description, logo_media_id, photo_media_ids, verification_level, relationship_disclosure, last_reviewed_at, status")
      .eq("id", id)
      .maybeSingle<Omit<ListingRow, "verification_note">>(),
    supabase.rpc("directory_editor_note", { p_id: id }),
    supabase.from("directory_categories").select("id, name").order("sort").returns<{ id: string; name: string }[]>(),
    supabase.from("media").select("id, storage_path, alt").order("created_at", { ascending: false }).limit(100).returns<{ id: string; storage_path: string; alt: string | null }[]>(),
  ]);
  const row = listingResult.data;
  if (!row || noteResult.error || typeof noteResult.data !== "string") notFound();

  const level: VerificationLevel = isVerificationLevel(row.verification_level) ? row.verification_level : "listed";
  const listing: ListingFormValue = {
    id: row.id,
    name: row.name,
    slug: row.slug,
    category_id: row.category_id,
    country_code: row.country_code,
    region: row.region ?? "",
    city: row.city ?? "",
    services: (row.services ?? []).join(", "),
    languages: (row.languages ?? []).join(", "),
    website: row.website ?? "",
    public_email: row.public_email ?? "",
    public_phone: row.public_phone ?? "",
    description: row.description,
    logo_media_id: row.logo_media_id ?? "",
    photo_ids: row.photo_media_ids ?? [],
    verification_level: level,
    verification_note: noteResult.data,
    relationship_disclosure: row.relationship_disclosure ?? "",
    last_reviewed_at: row.last_reviewed_at ? row.last_reviewed_at.slice(0, 10) : "",
    status: isStatus(row.status) ? row.status : "draft",
  };

  return (
    <main className="flex flex-col gap-4 p-6">
      <p><Link href="/admin/directory" className="text-sm underline">Back to directory</Link></p>
      <h1 className="text-2xl font-bold">{row.name}</h1>
      <ListingForm listing={listing} categories={categories.data ?? []} media={media.data ?? []} notice={notice} />
    </main>
  );
}
