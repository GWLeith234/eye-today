import "server-only";

import { execFileSync } from "node:child_process";

import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

import { sessionCookieOptions } from "@/lib/auth/cookie-options";
import { rateLimit } from "@/lib/http/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPublicSupabaseEnv } from "@/lib/supabase/env";

const ROLES = ["editor", "contributor", "reader"] as const;
type Role = (typeof ROLES)[number];

// Local GoTrue only. This module is absent from a build that was not started with E2E_FULL=1.
const PASSWORD = "e2e-only-password";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const unavailable = () => NextResponse.json({ error: "unavailable" }, { status: 503 });

function emailFor(role: Role) {
  return `e2e-${role}@example.com`;
}

// profiles_lock_role rejects role changes from service_role. The local CLI runs
// this as the database owner, which is the path migrations and tests already use.
function assignRole(userId: string, role: Role) {
  if (!UUID.test(userId)) throw new Error("bad id");
  const sql = `do $$ begin update public.profiles set role = '${role}' where id = '${userId}'; if not found then raise exception 'e2e profile missing'; end if; end $$;`;
  execFileSync("supabase", ["db", "query", "--local", sql], {
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 30_000,
  });
}

async function findUserId(admin: ReturnType<typeof createAdminClient>, email: string): Promise<string | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const found = listed.data.users.find((user) => user.email?.toLowerCase() === email);
    if (found) return found.id;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return null;
}

async function ensureUser(role: Role): Promise<string | null> {
  const admin = createAdminClient();
  const email = emailFor(role);
  const created = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  const userId = created.data.user?.id ?? (await findUserId(admin, email));
  if (!userId) return null;
  try {
    assignRole(userId, role);
  } catch (error) {
    console.error(`e2e role update failed: ${error instanceof Error ? error.message.split("\n")[0] : "unknown"}`);
    return null;
  }
  return userId;
}

export async function createE2ESession(request: Request) {
  if (!rateLimit("e2e-session", 30, 60_000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let role: Role;
  try {
    const body = (await request.json()) as { role?: unknown };
    if (typeof body.role !== "string" || !ROLES.includes(body.role as Role)) {
      return NextResponse.json({ error: "invalid" }, { status: 400 });
    }
    role = body.role as Role;
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const env = getPublicSupabaseEnv();
  if (!env) return unavailable();

  const email = emailFor(role);
  const userId = await ensureUser(role);
  if (!userId) return unavailable();

  const response = NextResponse.json({ id: userId, email, role });
  const base = sessionCookieOptions();
  const supabase = createServerClient(env.url, env.anonKey, {
    cookieOptions: base,
    cookies: {
      getAll() {
        return [];
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, { ...options, ...base });
        }
      },
    },
  });

  const signedIn = await supabase.auth.signInWithPassword({ email, password: PASSWORD });
  if (signedIn.error) return unavailable();
  return response;
}
