import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

import { type AppRole, type Area, AREA_HOME, loginPath, redirectFor } from "./access";

export type Profile = {
  id: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  role: AppRole;
};

// One getUser() + profile read per request, shared by layouts and pages.
export const getSession = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, profile: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name, bio, avatar_url, role")
    .eq("id", user.id)
    .maybeSingle<Profile>();

  return { supabase, user, profile };
});

// Server-side guard mirroring proxy.ts. Redirects, or returns the session.
export async function requireArea(area: Area) {
  const session = await getSession();
  const to = redirectFor(area, Boolean(session.user), session.profile?.role ?? null);
  if (to) redirect(to === "/login" ? loginPath(AREA_HOME[area]) : to);
  return session as typeof session & { user: NonNullable<typeof session.user> };
}
