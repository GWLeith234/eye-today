import assert from "node:assert/strict";
import { test } from "node:test";

import { contentSecurityPolicy, sentryCspReportUri } from "./security-headers";

test("a Sentry DSN becomes a CSP report endpoint", () => {
  assert.equal(
    sentryCspReportUri("https://abc123@o1.ingest.sentry.io/456"),
    "https://o1.ingest.sentry.io/api/456/security/?sentry_key=abc123",
  );
  assert.equal(sentryCspReportUri(""), null);
  assert.equal(sentryCspReportUri("not a url"), null);
});

test("CSP is report-only material and names the origins the site loads", () => {
  const saved = process.env.SENTRY_DSN;
  try {
    delete process.env.SENTRY_DSN;
    const policy = contentSecurityPolicy();
    assert.match(policy, /default-src 'self'/);
    assert.match(policy, /https:\/\/challenges\.cloudflare\.com/);
    assert.match(policy, /https:\/\/plausible\.io/);
    assert.match(policy, /https:\/\/www\.youtube-nocookie\.com/);
    assert.match(policy, /https:\/\/platform\.twitter\.com/);
    assert.match(policy, /https:\/\/www\.instagram\.com/);
    assert.match(policy, /https:\/\/\*\.supabase\.co/);
    // Directory map tiles (Sprint 13). Only images; no script or connect origin is added for OSM.
    assert.match(policy, /img-src [^;]*https:\/\/tile\.openstreetmap\.org/);
    assert.ok(!/(script|connect)-src [^;]*openstreetmap/.test(policy));
    assert.ok(!policy.includes("report-uri"));
    process.env.SENTRY_DSN = "https://public@o1.ingest.sentry.io/99";
    assert.match(contentSecurityPolicy(), /report-uri https:\/\/o1\.ingest\.sentry\.io\/api\/99\/security\//);
  } finally {
    if (saved === undefined) delete process.env.SENTRY_DSN;
    else process.env.SENTRY_DSN = saved;
  }
});

test("geolocation stays off in Permissions-Policy (the map never asks where the reader is)", async () => {
  const { securityHeaders } = await import("./security-headers");
  const value = securityHeaders().find((header) => header.key === "Permissions-Policy")?.value ?? "";
  assert.match(value, /geolocation=\(\)/);
});
