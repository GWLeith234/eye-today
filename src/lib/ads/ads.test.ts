import assert from "node:assert/strict";
import { test } from "node:test";

import { capReached, parseFrequency, serializeFrequency, withServed } from "./frequency";
import { imageFromHtml, pointLinksAt, sanitizeAdHtml } from "./sanitize";

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

test("an HTML creative that is one picture serves as an image; text-only HTML does not", () => {
  const picture = sanitizeAdHtml('<a href="https://clinic.example/"><img src="https://theeye.today/house-ads/leaderboard-728x90.png" alt="Eye Today"></a>');
  assert.equal(imageFromHtml(picture.html), "https://theeye.today/house-ads/leaderboard-728x90.png");
  const words = sanitizeAdHtml("<p><strong>Read this.</strong> <a href=\"https://x.example/\">Go</a></p>");
  assert.equal(imageFromHtml(words.html), null);
  const mixed = sanitizeAdHtml('<p>Caption <img src="https://x.example/a.png" alt=""></p>');
  assert.equal(imageFromHtml(mixed.html), null);
  const two = sanitizeAdHtml('<img src="https://x.example/a.png" alt=""><img src="https://x.example/b.png" alt="">');
  assert.equal(imageFromHtml(two.html), null);
});

// Sprint 24: the takeover units and the placement model.
test("the billboard tops every page type and the takeover is never self-serve", async () => {
  const { PLACEMENTS } = await import("./placements");
  const { AD_SLOT_NAMES, PAGE_TYPES, SELF_SERVE_SLOTS, SLOT_SIZES, SUPPORTER_HIDDEN, TAKEOVER_SLOTS } = await import("./slots");
  for (const page of PAGE_TYPES) assert.deepEqual(PLACEMENTS[page].top, ["billboard"], `${page} carries the billboard`);
  assert.equal(PLACEMENTS.home.band, "leaderboard", "the cover has the leaderboard band");
  assert.equal(PLACEMENTS.home.river, null, "the cover's Latest column is too narrow for an in-feed leaderboard");
  assert.deepEqual([...TAKEOVER_SLOTS], ["skin", "billboard"]);
  for (const slot of TAKEOVER_SLOTS) assert.ok(!SELF_SERVE_SLOTS.includes(slot), `${slot} is not self-serve`);
  assert.equal(SELF_SERVE_SLOTS.length + TAKEOVER_SLOTS.length, AD_SLOT_NAMES.length);
  assert.ok(SUPPORTER_HIDDEN.includes("skin"), "supporters do not see the skin");
  assert.deepEqual([SLOT_SIZES.billboard.width, SLOT_SIZES.billboard.height], [970, 250]);
  assert.deepEqual([SLOT_SIZES.skin.width, SLOT_SIZES.skin.height], [1920, 1400]);
  // Every unit but the skin is an IAB standard size.
  const iab = new Set(["970x250", "728x90", "300x250", "300x600", "320x50"]);
  for (const name of AD_SLOT_NAMES) {
    if (name === "skin") continue;
    assert.ok(iab.has(`${SLOT_SIZES[name].width}x${SLOT_SIZES[name].height}`), `${name} is an IAB size`);
  }
});
