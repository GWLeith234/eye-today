import { createClient } from "@supabase/supabase-js";

import { getPublicSupabaseEnv } from "./env";

// Cookie-less anon client for public pages: exactly what a signed-out visitor sees.
export function createAnonClient() {
  const env = getPublicSupabaseEnv();
  if (!env) return null;
  return createClient(env.url, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
