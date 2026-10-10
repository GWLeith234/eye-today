import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { commentScreenSchema } from "../ai/schemas";
import { decideCommentStatus } from "./status";

describe("decideCommentStatus", () => {
  it("holds a clean comment from someone with two published comments", () => {
    assert.equal(decideCommentStatus({ flags: [], publishedOthers: 2, shadowBanned: false }).status, "pending");
  });

  it("publishes a clean comment from someone with three published comments", () => {
    const decision = decideCommentStatus({ flags: [], publishedOthers: 3, shadowBanned: false });
    assert.equal(decision.status, "published");
    assert.deepEqual(decision.flags, []);
  });

  it("keeps a dosing flag pending, with its reason", () => {
    const flag = { kind: "dosing", reason: "Asks how much to take." };
    const decision = decideCommentStatus({ flags: [flag], publishedOthers: 10, shadowBanned: false });
    assert.equal(decision.status, "pending");
    assert.deepEqual(decision.flags, [flag]);
  });

  it("keeps a comment pending when the assistant threw or is missing", () => {
    const decision = decideCommentStatus({ flags: null, publishedOthers: 10, shadowBanned: false });
    assert.equal(decision.status, "pending");
    assert.deepEqual(decision.flags, []);
  });

  it("forces shadow for a shadow-banned user, even when clean and trusted", () => {
    assert.equal(decideCommentStatus({ flags: [], publishedOthers: 50, shadowBanned: true }).status, "shadow");
    assert.equal(decideCommentStatus({ flags: null, publishedOthers: 0, shadowBanned: true }).status, "shadow");
  });
});

describe("commentScreenSchema", () => {
  it("accepts known kinds and refuses unknown ones, markup and more than ten flags", () => {
    assert.equal(commentScreenSchema.safeParse({ flags: [{ kind: "dosing", reason: "Gives a dose." }] }).success, true);
    assert.equal(commentScreenSchema.safeParse({ flags: [{ kind: "other", reason: "x" }] }).success, false);
    assert.equal(commentScreenSchema.safeParse({ flags: [{ kind: "abuse", reason: "<b>x</b>" }] }).success, false);
    const many = Array.from({ length: 11 }, () => ({ kind: "abuse", reason: "x" }));
    assert.equal(commentScreenSchema.safeParse({ flags: many }).success, false);
  });
});
