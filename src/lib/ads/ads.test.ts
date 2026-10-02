import assert from "node:assert/strict";
import { test } from "node:test";

import { capReached, parseFrequency, serializeFrequency, withServed } from "./frequency";
import { pointLinksAt, sanitizeAdHtml } from "./sanitize";

test("a script and a javascript: link sanitize to nothing usable", () => {
  const result = sanitizeAdHtml('<script>alert(1)</script><a href="javascript:alert(2)"></a><img src="javascript:alert(3)">');
  assert.equal(result.usable, false);
  assert.doesNotMatch(result.html, /script|javascript|alert/i);
});

test("a javascript: link with text keeps the text but no link", () => {
  const result = sanitizeAdHtml('<p>Visit <a href="javascript:alert(1)">us</a></p>');
  assert.equal(result.usable, true);
  assert.doesNotMatch(result.html, /<a\b|javascript/i);
  assert.match(result.html, /Visit us/);
});

test("an https link gets rel=\"sponsored noopener noreferrer\" and opens in a new tab", () => {
  const result = sanitizeAdHtml('<p>Try <a href="https://clinic.example/spring" onclick="x()" rel="nofollow" target="_self">our clinic</a></p>');
  assert.match(result.html, /<a href="https:\/\/clinic\.example\/spring" rel="sponsored noopener noreferrer" target="_blank">our clinic<\/a>/);
  assert.doesNotMatch(result.html, /onclick|nofollow|_self/);
});

test("http links, iframes, forms, styles and handlers are removed", () => {
  const result = sanitizeAdHtml(
    '<p onmouseover="x()" style="color:red">Hi <a href="http://plain.example">plain</a></p><iframe src="https://x.example"></iframe><form><input></form><style>p{}</style>',
  );
  assert.doesNotMatch(result.html, /iframe|form|style|onmouseover|href=/i);
  assert.match(result.html, /Hi plain/);
});

test("images keep https sources only", () => {
  const ok = sanitizeAdHtml('<img src="https://cdn.example/a.png" alt="Logo" onerror="x()">');
  assert.match(ok.html, /<img src="https:\/\/cdn\.example\/a\.png" alt="Logo">/);
  assert.equal(ok.usable, true);
  assert.equal(sanitizeAdHtml('<img src="http://cdn.example/a.png">').usable, false);
  assert.equal(sanitizeAdHtml('<img src="data:image/png;base64,AAAA">').usable, false);
});

test("pointLinksAt sends every link to one address", () => {
  const html = sanitizeAdHtml('<a href="https://a.example/?x=1&y=2">a</a> <a href="https://b.example">b</a>').html;
  const pointed = pointLinksAt(html, "/api/ads/click/abc");
  assert.equal(pointed.match(/href="\/api\/ads\/click\/abc"/g)?.length, 2);
  assert.doesNotMatch(pointed, /a\.example|b\.example/);
});

test("frequency cookie counts today's views and stops at the cap", () => {
  const id = "a8000000-0000-4000-8000-0000000000d1";
  let freq = parseFrequency(null, "2026-09-29");
  assert.equal(capReached(freq, id, 2), false);
  freq = withServed(withServed(freq, id), id);
  assert.equal(capReached(freq, id, 2), true);
  assert.equal(capReached(freq, id, null), false);

  const round = parseFrequency(serializeFrequency(freq), "2026-09-29");
  assert.deepEqual(round.counts, { [id]: 2 });
  // A cookie from yesterday, or junk, starts over.
  assert.deepEqual(parseFrequency(serializeFrequency(freq), "2026-09-30").counts, {});
  assert.deepEqual(parseFrequency("garbage", "2026-09-29").counts, {});
  assert.deepEqual(parseFrequency("2026-09-29_not-a-uuid~3", "2026-09-29").counts, {});
});
