import { Client } from "pg";

import { e2eEnv } from "./guard";

// A direct login as the table owner. It is the only way to set a role: the profiles_lock_role trigger
// rejects role changes from everyone else, including the service role. Local database only (see guard.ts).
export async function withDb<T>(work: (db: Client) => Promise<T>): Promise<T> {
  const db = new Client({ connectionString: e2eEnv().databaseUrl });
  await db.connect();
  try {
    return await work(db);
  } finally {
    await db.end();
  }
}

export async function queryRows<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  return withDb(async (db) => (await db.query(sql, params)).rows as T[]);
}
