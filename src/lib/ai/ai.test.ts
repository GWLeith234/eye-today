import assert from "node:assert/strict";
import { test } from "node:test";

import {
  claimsSchema,
  copyEditSchema,
  filterTagSlugs,
  headlinesSchema,
  keepQuotedItems,
  summarySchema,
} from "./schemas";
import { cutBody, htmlToPlainText, MAX_BODY_CHARS } from "./text";

test("headline schema accepts one to five headlines", () => {
  assert.ok(headlinesSchema.safeParse({ headlines: ["One"] }).success);
  assert.ok(headlinesSchema.safeParse({ headlines: ["a", "b", "c", "d", "e"] }).success);
  assert.ok(!headlinesSchema.safeParse({ headlines: [] }).success);
});

test("headline schema rejects a sixth headline", () => {
  assert.ok(!headlinesSchema.safeParse({ headlines: ["a", "b", "c", "d", "e", "f"] }).success);
});

test("headline schema rejects a 201-character headline and accepts 200", () => {
  assert.ok(!headlinesSchema.safeParse({ headlines: ["x".repeat(201)] }).success);
  assert.ok(headlinesSchema.safeParse({ headlines: ["x".repeat(200)] }).success);
});

test("headline schema rejects markup", () => {
  assert.ok(!headlinesSchema.safeParse({ headlines: ["<b>Bold</b>"] }).success);
});

test("tag filter drops a slug that was not in the site list", () => {
  const site = [
    { id: "t1", slug: "ibogaine", name: "Ibogaine" },
    { id: "t2", slug: "policy", name: "Policy" },
  ];
  const picks = filterTagSlugs(["ibogaine", "made-up-tag", "policy", "ibogaine"], site);
  assert.deepEqual(picks.map((t) => t.id), ["t1", "t2"]);
  assert.deepEqual(filterTagSlugs(["nope"], site), []);
});

test("claims schema accepts kind medical and rejects other kinds", () => {
  const item = { sentence: "Ibogaine cures addiction.", reason: "No named source." };
  assert.ok(claimsSchema.safeParse({ items: [{ ...item, kind: "medical" }] }).success);
  assert.ok(!claimsSchema.safeParse({ items: [{ ...item, kind: "opinion" }] }).success);
});

test("copy edit schema rejects angle brackets", () => {
  const ok = { quote: "teh", suggestion: "the", reason: "Typo." };
  assert.ok(copyEditSchema.safeParse({ items: [ok] }).success);
  assert.ok(!copyEditSchema.safeParse({ items: [{ ...ok, suggestion: "<i>the</i>" }] }).success);
});

test("copy edit keeps only quotes found in the text that was sent", () => {
  const items = [{ quote: "real words" }, { quote: "invented words" }];
  assert.deepEqual(keepQuotedItems(items, "Some real words here."), [{ quote: "real words" }]);
});

test("summary schema caps points at five", () => {
  assert.ok(!summarySchema.safeParse({ points: ["a", "b", "c", "d", "e", "f"] }).success);
});

test("plain text has no markup and the body is cut at 12000 characters", () => {
  const text = htmlToPlainText("<p>Ibogaine &amp; care</p><script>alert(1)</script><p>&lt;b&gt;x</p>");
  assert.ok(!/[<>]/.test(text));
  assert.ok(text.includes("Ibogaine & care"));
  assert.ok(!text.includes("alert"));
  assert.equal(cutBody("x".repeat(MAX_BODY_CHARS + 50)).length, MAX_BODY_CHARS);
});
