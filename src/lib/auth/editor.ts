import "server-only";

import { createClient } from "@/lib/supabase/server";

import type { AppRole } from "./access";

export type EditorContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  role: AppRole;
};

// For server actions: getUser() on the user-scoped client, then require an
// editor or admin profile read through that same client. Writes that follow
// go through the returned client, so RLS still applies.
export async function getEditorContext(): Promise<EditorContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle<{ role: AppRole }>();
  if (!data || (data.role !== "editor" && data.role !== "admin")) return null;

  return { supabase, userId: user.id, role: data.role };
}
