import { createClient } from "@supabase/supabase-js";

import { getPublicSupabaseEnv } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

export async function GET() {
  const env = getPublicSupabaseEnv();
  if (!env) {
    return Response.json({ db: "error" }, { status: 503, headers });
  }

  try {
    const supabase = createClient(env.url, env.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await supabase.from("sections").select("id")
      .limit(1)
      .abortSignal(AbortSignal.timeout(5000));
    if (error) {
      return Response.json({ db: "error" }, { status: 503, headers });
    }
    return Response.json({ db: "ok" }, { headers });
  } catch {
    return Response.json({ db: "error" }, { status: 503, headers });
  }
}
