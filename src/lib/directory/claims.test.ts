import assert from "node:assert/strict";
import { test } from "node:test";

import { sha256Hex } from "@/lib/newsletter/tokens";

import { claimErrorKey, emailMatchesWebsite, newClaimCode, normalizeClaimCode, websiteHost } from "./claims";

test("a claim code is eight digits and only its sha256 is kept", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 50; i += 1) {
    const { code, hash } = newClaimCode();
    assert.match(code, /^\d{8}$/);
    assert.equal(hash, sha256Hex(code));
    assert.notEqual(hash, code);
    seen.add(code);
  }
  assert.ok(seen.size > 40, "codes are not constant");
});

test("pasted codes lose spaces and dashes", () => {
  assert.equal(normalizeClaimCode(" 1234 5678\n"), "12345678");
  assert.equal(normalizeClaimCode("1234-5678"), "12345678");
});

test("the email domain must equal the website host, with or without www.", () => {
  assert.equal(websiteHost("https://www.claimco.example/about"), "www.claimco.example");
  assert.equal(websiteHost("http://claimco.example"), null, "only https websites count");
  assert.equal(websiteHost(null), null);

  assert.ok(emailMatchesWebsite("me@claimco.example", "https://www.claimco.example/about"));
  assert.ok(emailMatchesWebsite("me@www.claimco.example", "https://www.claimco.example"));
  assert.ok(emailMatchesWebsite("ME@Claimco.Example", "https://claimco.example"));
  assert.ok(!emailMatchesWebsite("me@mail.claimco.example", "https://claimco.example"), "a subdomain is not the host");
  assert.ok(!emailMatchesWebsite("me@claimco.example.evil.test", "https://claimco.example"));
  assert.ok(!emailMatchesWebsite("me@gmail.com", "https://claimco.example"));
  assert.ok(!emailMatchesWebsite("me@claimco.example", null), "no website, no email claim");
});

test("database messages map to calm, specific keys", () => {
  assert.equal(claimErrorKey({ message: "domain mismatch", code: "P0001" }), "domain");
  assert.equal(claimErrorKey({ message: "too many claims" }), "limit");
  assert.equal(claimErrorKey({ message: "already owner" }), "owner");
  assert.equal(claimErrorKey({ message: "claim pending" }), "pending");
  assert.equal(claimErrorKey({ code: "23514", message: "invalid claim" }), "invalid");
  assert.equal(claimErrorKey({ message: "something else" }), "unavailable");
  assert.equal(claimErrorKey(null), "unavailable");
});
