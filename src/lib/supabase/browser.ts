import { createBrowserClient } from "@supabase/ssr";

// The only Supabase client client components may use. Anon key + RLS.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
