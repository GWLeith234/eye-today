import "server-only";

import { getSession } from "@/lib/auth/session";

// Lists the editor side panel needs, read with the editor's own session.
export async function loadEditorLists() {
  const { supabase } = await getSession();
  const [sections, tags, people, media] = await Promise.all([
    supabase.from("sections").select("id, name").order("sort").order("name"),
    supabase.from("tags").select("id, name").order("name"),
    supabase.from("profiles").select("id, display_name, role").order("display_name"),
    supabase.from("media").select("id, storage_path, alt").order("created_at", { ascending: false }).limit(100),
  ]);
  return {
    sections: (sections.data ?? []) as { id: string; name: string }[],
    tags: (tags.data ?? []) as { id: string; name: string }[],
    people: ((people.data ?? []) as { id: string; display_name: string | null; role: string }[]).map((p) => ({
      id: p.id,
      name: `${p.display_name ?? "Unnamed"} (${p.role})`,
    })),
    media: (media.data ?? []) as { id: string; storage_path: string; alt: string | null }[],
  };
}
