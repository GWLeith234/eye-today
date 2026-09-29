import assert from "node:assert/strict";
import { test } from "node:test";

import { CHECK_EMAIL, NOT_CONFIGURED_MESSAGE, processSignup, type SignupDeps } from "./signup";
import { hashIp, isHash, isTokenShape, newConfirmToken, sha256Hex, unsubscribeToken } from "./tokens";
import { confirmUrl, unsubscribeUrl } from "./urls";

test("confirm token round trip: 32 random bytes, only the sha256 is kept", () => {
  const a = newConfirmToken();
  const b = newConfirmToken();
  assert.notEqual(a.raw, b.raw);
  assert.equal(Buffer.from(a.raw, "base64url").length, 32);
  assert.ok(isTokenShape(a.raw));
  assert.ok(isHash(a.hash));
  assert.equal(a.hash, sha256Hex(a.raw));
  assert.notEqual(a.hash, a.raw);
});

test("the confirm link carries the raw token and the token survives the URL", () => {
  const t = newConfirmToken();
  const url = new URL(confirmUrl("https://eye.example/", t.raw));
  assert.equal(url.origin + url.pathname, "https://eye.example/newsletter/confirm");
  assert.equal(sha256Hex(url.searchParams.get("t") ?? ""), t.hash);
});

test("unsubscribe token: stable for a confirmation, secret-dependent, stored as a hash", () => {
  const confirm = newConfirmToken().hash;
  const one = unsubscribeToken("secret-a", confirm);
  assert.deepEqual(unsubscribeToken("secret-a", confirm), one);
  assert.notEqual(unsubscribeToken("secret-b", confirm).raw, one.raw);
  assert.notEqual(unsubscribeToken("secret-a", newConfirmToken().hash).raw, one.raw);
  assert.equal(one.hash, sha256Hex(one.raw));
  assert.ok(isTokenShape(one.raw));

  const url = new URL(unsubscribeUrl("https://eye.example", one.raw));
  assert.equal(sha256Hex(url.searchParams.get("t") ?? ""), one.hash);
});

test("token shape rejects junk", () => {
  assert.ok(!isTokenShape(""));
  assert.ok(!isTokenShape("short"));
  assert.ok(!isTokenShape("has spaces in it but is long enough to pass length"));
  assert.ok(!isTokenShape(null));
});

test("ip hash uses the salt (or the default) and only the first forwarded address", () => {
  const first = hashIp("203.0.113.9, 10.0.0.1", "salty");
  assert.equal(first, sha256Hex("salty:203.0.113.9"));
  assert.equal(hashIp("203.0.113.9", "salty"), first);
  assert.equal(hashIp("203.0.113.9", "  "), sha256Hex("eye-today-view:203.0.113.9"));
  assert.equal(hashIp(null, undefined), sha256Hex("eye-today-view:"));
  assert.ok(!first.includes("203.0.113.9"));
});

function deps(rpc: boolean | null) {
  const sent: { to: string; listName: string; confirmUrl: string }[] = [];
  const calls: { list_slug: string; confirm_token_hash: string }[] = [];
  const d: SignupDeps = {
    configured: true,
    siteUrl: "https://eye.example",
    ipHash: "a".repeat(64),
    requestSubscribe: async (args) => {
      calls.push(args);
      return rpc;
    },
    sendConfirm: async (args) => void sent.push(args),
    defer: (work) => void work(),
  };
  return { d, sent, calls };
}

test("the public message is the same whether the RPC returns true, false or fails", async () => {
  const input = { email: "Reader@Example.com ", lists: ["weekly"] };
  const replies = [];
  for (const rpc of [true, false, null]) replies.push(await processSignup(input, deps(rpc).d));
  assert.deepEqual(replies[0], { ok: true, message: CHECK_EMAIL });
  assert.deepEqual(replies[1], replies[0]);
  assert.deepEqual(replies[2], replies[0]);
});

test("the confirm mail goes out only when the RPC returns true, with a token that hashes to the one sent", async () => {
  const yes = deps(true);
  await processSignup({ email: "reader@example.com", lists: ["daily", "weekly"] }, yes.d);
  assert.equal(yes.sent.length, 2);
  assert.equal(yes.sent[0].to, "reader@example.com");
  const raw = new URL(yes.sent[0].confirmUrl).searchParams.get("t") ?? "";
  assert.equal(sha256Hex(raw), yes.calls[0].confirm_token_hash);
  assert.notEqual(yes.calls[0].confirm_token_hash, yes.calls[1].confirm_token_hash);

  const no = deps(false);
  await processSignup({ email: "reader@example.com", lists: ["daily"] }, no.d);
  assert.equal(no.sent.length, 0);
});

test("only the daily and weekly lists are ever requested", async () => {
  const d = deps(true);
  const reply = await processSignup({ email: "reader@example.com", lists: ["secret", "weekly"] }, d.d);
  assert.equal(reply.ok, true);
  assert.deepEqual(d.calls.map((c) => c.list_slug), ["weekly"]);
  const none = await processSignup({ email: "reader@example.com", lists: ["secret"] }, deps(true).d);
  assert.equal(none.ok, false);
});

test("unconfigured mail says so and makes no RPC call", async () => {
  const d = deps(true);
  const reply = await processSignup({ email: "reader@example.com", lists: ["daily"] }, { ...d.d, configured: false });
  assert.deepEqual(reply, { ok: false, message: NOT_CONFIGURED_MESSAGE });
  assert.equal(d.calls.length, 0);
});

test("a bad address is refused before any call", async () => {
  const d = deps(true);
  const reply = await processSignup({ email: "nope", lists: ["daily"] }, d.d);
  assert.equal(reply.ok, false);
  assert.equal(d.calls.length, 0);
});
