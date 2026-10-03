import { mkdirSync, rmSync } from "node:fs";

import { queryRows } from "./helpers/db";
import { e2eEnv } from "./helpers/guard";

// Runs only when E2E_FULL=1. Fails fast, before any browser starts, when the stack is not what the
// flows assume: a local database, migrated and seeded.
export default async function globalSetup() {
  const env = e2eEnv();

  for (const dir of new Set([env.mailboxDir, env.recordDir])) {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
  }

  const [counts] = await queryRows<{ sections: string; tiers: string; slots: string; lists: string }>(
    `select (select count(*) from public.sections) as sections,
            (select count(*) from public.membership_tiers) as tiers,
            (select count(*) from public.ad_slots) as slots,
            (select count(*) from public.newsletter_lists) as lists`,
  );
  if (!counts || Object.values(counts).some((n) => Number(n) === 0)) {
    throw new Error(`The local database is not seeded (${JSON.stringify(counts)}). Run \`supabase db reset\` or \`supabase start\` first.`);
  }
}
