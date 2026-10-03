import assert from "node:assert/strict";
import { test } from "node:test";

import { sessionCookieOptions } from "./cookie-options";

test("http site URLs do not mark session cookies secure", () => {
  assert.equal(sessionCookieOptions({ SITE_URL: "http://127.0.0.1:3000", NODE_ENV: "production" }).secure, false);
  assert.equal(sessionCookieOptions({ SITE_URL: "https://eye.example", NODE_ENV: "production" }).secure, true);
  assert.equal(sessionCookieOptions({ NODE_ENV: "production" }).secure, true);
  assert.equal(sessionCookieOptions({ NODE_ENV: "development" }).secure, false);
});
