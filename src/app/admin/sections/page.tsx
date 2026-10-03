import { SECTION_ICONS } from "@/components/public/section-icon";
import { TaxonomyPage } from "@/components/taxonomy-page";
import { requireArea } from "@/lib/auth/session";
import { sectionStyle } from "@/lib/design/section";

import { create, rename, updateStyle } from "./actions";

export default async function SectionsPage({ searchParams }: PageProps<"/admin/sections">) {
  const { supabase } = await requireArea("admin");
  const { data } = await supabase.from("sections").select("id, name, slug, sort, color, icon").order("sort").order("name");
  return (
    <TaxonomyPage
      title="Sections"
      rows={data ?? []}
      params={await searchParams}
      create={create}
      rename={rename}
      withSort
      extra={{
        header: "Colour and icon",
        cell: (row) => (
          <form action={updateStyle} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="id" value={row.id} />
            <span aria-hidden="true" style={sectionStyle(row.slug, row.color)} className="sec-bg inline-block h-6 w-6 rounded border border-rule" />
            <input type="color" name="color" defaultValue={(row.color ?? "#1e5b4a").toLowerCase()} aria-label={`Colour for ${row.name}`} className="h-8 w-12 rounded border" />
            <select name="icon" defaultValue={row.icon ?? ""} aria-label={`Icon for ${row.name}`} className="rounded border px-2 py-1">
              <option value="">No icon</option>
              {SECTION_ICONS.map((icon) => (
                <option key={icon} value={icon}>{icon}</option>
              ))}
            </select>
            <button type="submit" className="rounded border px-2 py-1">Save</button>
            <button type="submit" name="reset" value="1" className="rounded border px-2 py-1">Use default</button>
          </form>
        ),
      }}
    />
  );
}
