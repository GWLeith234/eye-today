import { TaxonomyPage } from "@/components/taxonomy-page";
import { requireArea } from "@/lib/auth/session";

import { create, rename } from "./actions";

export default async function SectionsPage({ searchParams }: PageProps<"/admin/sections">) {
  const { supabase } = await requireArea("admin");
  const { data } = await supabase.from("sections").select("id, name, slug, sort, color, icon").order("sort").order("name");
  return (
    <TaxonomyPage title="Sections" rows={data ?? []} params={await searchParams} create={create} rename={rename} withSort withBrand />
  );
}
