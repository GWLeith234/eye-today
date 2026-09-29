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
  for (const slug of ["admin", "api", "articles", "search", "author", "tag", "Privacy"]) {
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
