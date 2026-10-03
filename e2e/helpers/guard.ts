// Safety rails for everything under e2e/helpers. These helpers create users and set roles with the
// service role and a direct database login, so they refuse to run anywhere but a throwaway local stack.
// Pure: no database or network access, so src/lib/e2e-isolation.test.ts can exercise it.

type Env = Record<string, string | undefined>;

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

export type E2eEnv = {
  supabaseUrl: string;
  anonKey: string;
  serviceRoleKey: string;
  databaseUrl: string;
  mailboxDir: string;
  recordDir: string;
  stripeWebhookSecret: string;
  cronSecret: string;
  prices: { monthly: string; annual: string; once: string };
  siteUrl: string;
};

export const e2eFull = (env: Env = process.env) => env.E2E_FULL === "1";

function required(env: Env, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`E2E_FULL=1 needs ${name}. See docs/sprints/sprint-10b-e2e.md.`);
  return value;
}

export function assertLocalUrl(name: string, value: string) {
  let host: string;
  try {
    host = new URL(value).hostname;
  } catch {
    throw new Error(`${name} is not a URL.`);
  }
  if (!LOCAL_HOSTS.has(host)) throw new Error(`${name} points at ${host}. End-to-end helpers only run against localhost or 127.0.0.1.`);
}

export function e2eEnv(env: Env = process.env): E2eEnv {
  if (!e2eFull(env)) throw new Error("End-to-end helpers are disabled: set E2E_FULL=1.");
  if (env.NODE_ENV === "production") throw new Error("End-to-end helpers never run with NODE_ENV=production.");

  const supabaseUrl = required(env, "NEXT_PUBLIC_SUPABASE_URL");
  const databaseUrl = required(env, "E2E_DATABASE_URL");
  const siteUrl = required(env, "SITE_URL");
  assertLocalUrl("NEXT_PUBLIC_SUPABASE_URL", supabaseUrl);
  assertLocalUrl("E2E_DATABASE_URL", databaseUrl);
  assertLocalUrl("SITE_URL", siteUrl);

  return {
    supabaseUrl,
    anonKey: required(env, "NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    serviceRoleKey: required(env, "SUPABASE_SERVICE_ROLE_KEY"),
    databaseUrl,
    mailboxDir: required(env, "E2E_MAILBOX_DIR"),
    recordDir: required(env, "E2E_RECORD_DIR"),
    stripeWebhookSecret: required(env, "STRIPE_WEBHOOK_SECRET"),
    cronSecret: required(env, "CRON_SECRET"),
    prices: { monthly: required(env, "STRIPE_PRICE_MONTHLY"), annual: required(env, "STRIPE_PRICE_ANNUAL"), once: required(env, "STRIPE_PRICE_ONCE") },
    siteUrl,
  };
}
