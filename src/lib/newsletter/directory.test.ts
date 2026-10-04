import assert from "node:assert/strict";
import { test } from "node:test";

import { DIRECTORY_WINDOW_DAYS, MAX_DIRECTORY_ITEMS, newDirectoryListings } from "./directory";

type Row = Record<string, unknown>;

// Records the query and answers with fixed rows.
function fakeSupabase(rows: Row[] | null, error = false) {
  const calls: { method: string; args: unknown[] }[] = [];
  const builder: Record<string, (...args: unknown[]) => unknown> = {};
  for (const method of ["select", "eq", "gte", "order", "limit"]) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    };
  }
  builder.returns = async () => (error ? { data: null, error: { code: "x" } } : { data: rows, error: null });
  return { client: { from: () => builder } as never, calls };
}

const NOW = new Date("2026-10-10T12:00:00Z");
const row = (slug: string, extra: Row = {}) => ({
  name: `Name ${slug}`,
  slug,
  city: "Tulum",
  country_code: "MX",
  directory_categories: { name: "Treatment clinic / retreat", hidden: false },
  ...extra,
});

test("only published listings from the last 7 days are asked for, newest first", async () => {
  const { client, calls } = fakeSupabase([]);
  await newDirectoryListings(client, "https://eye.example/", NOW);
  const find = (method: string) => calls.find((call) => call.method === method)?.args;
  assert.deepEqual(find("eq"), ["status", "published"]);
  assert.deepEqual(find("gte"), ["created_at", new Date(NOW.getTime() - DIRECTORY_WINDOW_DAYS * 86_400_000).toISOString()]);
  assert.deepEqual(find("order"), ["created_at", { ascending: false }]);
  assert.equal(DIRECTORY_WINDOW_DAYS, 7);
});

test("items carry absolute listing URLs and a readable place", async () => {
  const { client } = fakeSupabase([row("alpha")]);
  assert.deepEqual(await newDirectoryListings(client, "https://eye.example/", NOW), [
    { name: "Name alpha", url: "https://eye.example/directory/listing/alpha", place: "Tulum, Mexico", category: "Treatment clinic / retreat" },
  ]);
});

test("hidden categories are skipped, and the list is capped", async () => {
  const many = Array.from({ length: 20 }, (_, i) => row(`l${i}`));
  const { client } = fakeSupabase([row("hidden", { directory_categories: { name: "X", hidden: true } }), row("nocat", { directory_categories: null }), ...many]);
  const items = await newDirectoryListings(client, "https://eye.example", NOW);
  assert.equal(items.length, MAX_DIRECTORY_ITEMS);
  assert.ok(items.every((item) => !item.url.endsWith("/hidden") && !item.url.endsWith("/nocat")));
});

test("no listings, or a failed read, means no section", async () => {
  assert.deepEqual(await newDirectoryListings(fakeSupabase([]).client, "https://eye.example", NOW), []);
  assert.deepEqual(await newDirectoryListings(fakeSupabase(null, true).client, "https://eye.example", NOW), []);
});
