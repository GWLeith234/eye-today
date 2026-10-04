import { requireArea } from "@/lib/auth/session";

import { ListingForm, type ListingFormValue } from "../listing-form";

export default async function NewListingPage() {
  const { supabase } = await requireArea("admin");
  const [categories, media] = await Promise.all([
    supabase.from("directory_categories").select("id, name").order("sort").returns<{ id: string; name: string }[]>(),
    supabase.from("media").select("id, storage_path, alt").order("created_at", { ascending: false }).limit(100).returns<{ id: string; storage_path: string; alt: string | null }[]>(),
  ]);
  const first = categories.data?.[0];
  const listing: ListingFormValue = {
    id: "",
    name: "",
    slug: "",
    category_id: first?.id ?? "",
    country_code: "",
    region: "",
    city: "",
    services: "",
    languages: "",
    website: "",
    public_email: "",
    public_phone: "",
    description: "",
    logo_media_id: "",
    photo_ids: [],
    verification_level: "listed",
    verification_note: "",
    relationship_disclosure: "",
    last_reviewed_at: "",
    status: "draft",
    lat: "",
    lng: "",
  };

  return (
    <main className="flex flex-col gap-4 p-6">
      <h1 className="text-2xl font-bold">New listing</h1>
      <ListingForm listing={listing} categories={categories.data ?? []} media={media.data ?? []} />
    </main>
  );
}
