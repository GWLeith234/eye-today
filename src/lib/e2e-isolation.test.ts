import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";

import { e2eEnv, e2eFull } from "../../e2e/helpers/guard";

// The end-to-end sign-in helper lives only under e2e/. These tests prove it cannot run unless it is
// asked to and is pointed at a local stack, and that nothing in src/ (what production builds) can mint
// a session outside the normal login routes.

const VALID = {
  E2E_FULL: "1",
  NODE_ENV: "test",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  E2E_DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  SITE_URL: "http://127.0.0.1:3000",
  E2E_MAILBOX_DIR: "/tmp/e2e",
  E2E_RECORD_DIR: "/tmp/e2e",
  STRIPE_WEBHOOK_SECRET: "whsec",
  CRON_SECRET: "cron",
  STRIPE_PRICE_MONTHLY: "price_m",
  STRIPE_PRICE_ANNUAL: "price_a",
  STRIPE_PRICE_ONCE: "price_o",
};

test("the helpers are disabled unless E2E_FULL is exactly 1", () => {
  for (const value of [undefined, "", "0", "true", "yes"]) {
    assert.equal(e2eFull({ E2E_FULL: value }), false);
    assert.throws(() => e2eEnv({ ...VALID, E2E_FULL: value }), /E2E_FULL=1/);
  }
  assert.equal(e2eFull(VALID), true);
  assert.equal(e2eEnv(VALID).supabaseUrl, VALID.NEXT_PUBLIC_SUPABASE_URL);
});

test("the helpers refuse to run in a production environment", () => {
  assert.throws(() => e2eEnv({ ...VALID, NODE_ENV: "production" }), /NODE_ENV=production/);
});

test("the helpers refuse any Supabase, database or site URL that is not local", () => {
  assert.throws(() => e2eEnv({ ...VALID, NEXT_PUBLIC_SUPABASE_URL: "https://abcd.supabase.co" }), /localhost or 127\.0\.0\.1/);
  assert.throws(() => e2eEnv({ ...VALID, E2E_DATABASE_URL: "postgresql://postgres:pw@db.abcd.supabase.co:5432/postgres" }), /localhost or 127\.0\.0\.1/);
  assert.throws(() => e2eEnv({ ...VALID, SITE_URL: "https://eye-today.example" }), /localhost or 127\.0\.0\.1/);
  assert.doesNotThrow(() => e2eEnv({ ...VALID, NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321" }));
});

test("the helpers name what is missing", () => {
  assert.throws(() => e2eEnv({ ...VALID, SUPABASE_SERVICE_ROLE_KEY: undefined }), /SUPABASE_SERVICE_ROLE_KEY/);
  assert.throws(() => e2eEnv({ ...VALID, E2E_DATABASE_URL: " " }), /E2E_DATABASE_URL/);
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|js|mjs)$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : [];
  });
}

test("nothing that ships in src/ knows about the e2e flag, the helpers, or mints a session on request", () => {
  const src = join(process.cwd(), "src");
  const forbidden = [/E2E_FULL/, /e2e\/helpers/, /\bgenerateLink\b/, /\bsignInWithPassword\b/, /\bsetSession\b/, /\bsignInAnonymously\b/];
  const hits: string[] = [];
  for (const file of sourceFiles(src)) {
    const text = readFileSync(file, "utf8");
    for (const pattern of forbidden) if (pattern.test(text)) hits.push(`${relative(process.cwd(), file)} matches ${pattern}`);
  }
  assert.deepEqual(hits, []);
});

test("no route in src/app has a test-login or e2e path", () => {
  const routes = sourceFiles(join(process.cwd(), "src", "app")).map((file) => relative(join(process.cwd(), "src", "app"), file).toLowerCase());
  assert.deepEqual(routes.filter((route) => /(^|[\\/])(e2e|__e2e|test-login|test-session|e2e-session)([\\/]|$)/.test(route)), []);
});
