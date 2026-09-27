import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

// Single-site for now. Sites are not readable through the API, so take the
// site from a section (sections are public and every article needs one).
export async function getSiteId(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase.from("sections").select("site_id").limit(1).maybeSingle<{ site_id: string }>();
  return data?.site_id ?? null;
}
