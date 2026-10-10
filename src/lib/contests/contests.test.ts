import assert from "node:assert/strict";
import { test } from "node:test";

import { buildPollView, percent } from "../polls/types";
import { deviceHash } from "../polls/device-hash";

import { csvField, drawIndex, pickWinner, toCsv } from "./draw";

const SEED = "a".repeat(64);

test("the same seed and entries always give the same winner, whatever order they arrive in", () => {
  const entries = ["e3", "e1", "e2", "e5", "e4"].map((id) => ({ id }));
  const first = pickWinner(SEED, entries);
  const again = pickWinner(SEED, [...entries].reverse());
  assert.equal(first.winner.id, again.winner.id);
  assert.equal(first.index, drawIndex(SEED, 5));
  assert.deepEqual(first.ordered.map((e) => e.id), ["e1", "e2", "e3", "e4", "e5"]);
});

test("the TypeScript rule matches the database draw on a shared vector", () => {
  // supabase/tests/0018_polls_contests.sql asserts draw_contest picks the same entry for this seed.
  const ids = ["d1800000-0000-4000-8000-0000000000f2", "d1800000-0000-4000-8000-0000000000f3", "d1800000-0000-4000-8000-0000000000f1"];
  assert.equal(pickWinner("ab".repeat(32), ids.map((id) => ({ id }))).winner.id, "d1800000-0000-4000-8000-0000000000f3");
});

test("different seeds spread across entries, and bad input is refused", () => {
  const seen = new Set<number>();
  for (let i = 0; i < 64; i += 1) seen.add(drawIndex(i.toString(16).padStart(64, "0"), 4));
  assert.equal(seen.size, 4);
  assert.throws(() => drawIndex("xyz", 3));
  assert.throws(() => drawIndex(SEED, 0));
});

test("CSV export quotes fields and defuses spreadsheet formulas", () => {
  assert.equal(csvField('He said "hi"'), '"He said ""hi"""');
  assert.equal(csvField("=HYPERLINK(1)"), `"'=HYPERLINK(1)"`);
  assert.equal(toCsv(["a", "b"], [["1", null]]), '"a","b"\r\n"1",""\r\n');
});

test("poll view shows counts to a voter but hides them for after-close polls until they close", () => {
  const rows = [
    { id: "p", question: "Q", state: "open" as const, results: "after_vote" as const, closes_at: null, option_id: "o1", label: "A", votes: null, total: null },
    { id: "p", question: "Q", state: "open" as const, results: "after_vote" as const, closes_at: null, option_id: "o2", label: "B", votes: null, total: null },
  ];
  const voter = [
    { option_id: "o1", votes: 3, total: 4, my_option: "o2" },
    { option_id: "o2", votes: 1, total: 4, my_option: "o2" },
  ];
  const seen = buildPollView(rows, voter)!;
  assert.deepEqual(seen.options.map((o) => o.votes), [3, 1]);
  assert.equal(seen.total, 4);
  assert.equal(seen.myOption, "o2");
  assert.equal(buildPollView(rows, [])!.total, null);
  const afterClose = buildPollView(rows.map((r) => ({ ...r, results: "after_close" as const })), voter)!;
  assert.equal(afterClose.total, null);
  assert.equal(afterClose.myOption, "o2");
  assert.equal(percent(1, 3), 33);
  assert.equal(percent(null, 3), 0);
});

test("device hashes are salted sha256 and never the token", () => {
  const h = deviceHash("token-abc", "salt");
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.notEqual(h, deviceHash("token-abc", "other"));
  assert.ok(!h.includes("token"));
});
