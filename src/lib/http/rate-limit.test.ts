import assert from "node:assert/strict";
import { test } from "node:test";

import { forwardedIp, rateLimit, resetRateLimits } from "./rate-limit";

test("rate limit allows the window and then refuses", () => {
  resetRateLimits();
  assert.equal(rateLimit("checkout:test", 2, 60_000, 1_000), true);
  assert.equal(rateLimit("checkout:test", 2, 60_000, 1_100), true);
  assert.equal(rateLimit("checkout:test", 2, 60_000, 1_200), false);
  assert.equal(rateLimit("checkout:test", 2, 60_000, 61_200), true);
});

test("forwarded IP uses the first address only", () => {
  assert.equal(forwardedIp("203.0.113.5, 10.0.0.1"), "203.0.113.5");
  assert.equal(forwardedIp(null), "unknown");
});
