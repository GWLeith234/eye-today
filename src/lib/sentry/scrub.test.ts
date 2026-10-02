import assert from "node:assert/strict";
import { test } from "node:test";

import { scrubSentryEvent } from "./scrub";

test("sentry events lose emails, tokens and authorization", () => {
  const clean = scrubSentryEvent({
    message: "failed for ada@example.com with sk_live_abc123",
    request: { headers: { Authorization: "Bearer secret", accept: "text/html" } },
    user: { email: "ada@example.com", id: "1" },
  });
  assert.equal(clean.message, "failed for [email] with [token]");
  assert.equal(clean.request?.headers?.Authorization, undefined);
  assert.equal(clean.request?.headers?.accept, "text/html");
  assert.equal(clean.user?.email, undefined);
  assert.equal(clean.user?.id, "1");
});
