import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getPublicSupabaseEnv } from "./env";

// Service-role client. Bypasses RLS — use only in trusted server code, never
// in a route that returns user-controlled data without its own auth check.
export function createAdminClient() {
  const env = getPublicSupabaseEnv();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!env || !serviceRoleKey) {
    throw new Error("Supabase admin client is not configured");
  }
  return createClient(env.url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
