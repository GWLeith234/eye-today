import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { sessionCookieOptions } from "@/lib/auth/cookie-options";

import { getPublicSupabaseEnv } from "./env";

// User-scoped client for Server Components, Server Actions and Route Handlers.
// Uses the anon key plus the caller's session cookies, so RLS applies.
export async function createClient() {
  const env = getPublicSupabaseEnv();
  if (!env) {
    throw new Error("Supabase is not configured");
  }
  const cookieStore = await cookies();

  return createServerClient(env.url, env.anonKey, {
    cookieOptions: sessionCookieOptions(),
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot set cookies; proxy.ts refreshes the session.
        }
      },
    },
  });
}
