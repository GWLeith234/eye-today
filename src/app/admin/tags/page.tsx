import { TaxonomyPage } from "@/components/taxonomy-page";
import { requireArea } from "@/lib/auth/session";

import { create, rename } from "./actions";

export default async function TagsPage({ searchParams }: PageProps<"/admin/tags">) {
  const { supabase } = await requireArea("admin");
  const { data } = await supabase.from("tags").select("id, name, slug").order("name");
  return <TaxonomyPage title="Tags" rows={data ?? []} params={await searchParams} create={create} rename={rename} />;
}
