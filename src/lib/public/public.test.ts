import assert from "node:assert/strict";
import { test } from "node:test";

import { MEDICAL_DISCLAIMER } from "./disclaimer";
import { MAX_PAGE, parsePage } from "./paging";
import { isReservedSectionSlug } from "./reserved";

test("?page accepts 1..100 only", () => {
  assert.equal(parsePage("2"), 2);
  assert.equal(parsePage(String(MAX_PAGE)), MAX_PAGE);
  for (const bad of [undefined, "", "0", "101", "-1", "1.5", "abc", "9999", ["2"]]) {
    assert.equal(parsePage(bad), 1, String(bad));
  }
});

test("app paths cannot be section slugs", () => {
  for (const slug of ["admin", "api", "articles", "search", "author", "tag", "Privacy", "disclaimer", "ad-policy", "directory"]) {
    assert.ok(isReservedSectionSlug(slug), slug);
  }
  assert.ok(!isReservedSectionSlug("news"));
});

test("medical disclaimer text is exact", () => {
  assert.equal(
    MEDICAL_DISCLAIMER,
    "Information only — not medical advice. Ibogaine and psychedelics carry serious medical and legal risks.",
  );
});

test("feed text is XML-escaped and stripped of forbidden characters", async () => {
  const { xmlEscape } = await import("./feeds");
  assert.equal(xmlEscape(`Tom & "Jerry" <b>'s</b>\u0001`), "Tom &amp; &quot;Jerry&quot; &lt;b&gt;&apos;s&lt;/b&gt;");
});

test("absolute URLs only when SITE_URL is set", async () => {
  const { absoluteUrl, publicDate } = await import("./site");
  const saved = process.env.SITE_URL;
  try {
    delete process.env.SITE_URL;
    assert.equal(absoluteUrl("/news/a"), "/news/a");
    process.env.SITE_URL = "https://eye.example/";
    assert.equal(absoluteUrl("/news/a"), "https://eye.example/news/a");
  } finally {
    if (saved === undefined) delete process.env.SITE_URL;
    else process.env.SITE_URL = saved;
  }
  assert.equal(publicDate({ status: "scheduled", published_at: null, scheduled_for: "s" }), "s");
  assert.equal(publicDate({ status: "published", published_at: "p", scheduled_for: "s" }), "p");
});
