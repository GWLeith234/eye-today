import { randomBytes } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";

import { withDb } from "./db";
import { e2eEnv } from "./guard";

export type TestRole = "reader" | "contributor" | "editor";
export type TestUser = { id: string; email: string; role: TestRole };

export const uniqueId = () => `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;

function admin() {
  const env = e2eEnv();
  return createClient(env.supabaseUrl, env.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

// Creates a confirmed user (the signup trigger gives them a reader profile) and sets the role.
// Emails are unique per call, so reruns against a database that was not reset never collide.
export async function createTestUser(label: string, role: TestRole): Promise<TestUser> {
  const email = `e2e-${label}-${uniqueId()}@e2e.eyetoday.test`;
  const { data, error } = await admin().auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: `E2E ${label}` },
  });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message ?? "no user"}`);
  const id = data.user.id;

  if (role !== "reader") {
    await withDb(async (db) => {
      const result = await db.query("update public.profiles set role = $2 where id = $1", [id, role]);
      if (result.rowCount !== 1) throw new Error("the signup trigger did not create a profile");
    });
  }
  return { id, email, role };
}

// Signs the browser in without any email: GoTrue mints a magic-link token (nothing is sent), and the
// app's own /auth/callback exchanges it, exactly as it would for a link from a real email.
export async function signInAs(page: Page, user: TestUser, next: string): Promise<void> {
  const { data, error } = await admin().auth.admin.generateLink({ type: "magiclink", email: user.email });
  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) throw new Error(`generateLink failed: ${error?.message ?? "no token"}`);

  await page.goto(`/auth/callback?token_hash=${encodeURIComponent(tokenHash)}&type=magiclink&next=${encodeURIComponent(next)}`);
  if (new URL(page.url()).pathname.startsWith("/login")) throw new Error(`sign-in as ${user.role} was rejected: ${page.url()}`);
}
