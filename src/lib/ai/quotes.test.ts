import assert from "node:assert/strict";
import { test } from "node:test";

import { chromeForNewRun, locateQuote, replaceQuoteOnce } from "./quotes";
import { keepQuotedItems } from "./schemas";

test("copy edit accepts a quote that differs only by non-breaking spaces", () => {
  const text = "Keep the\u00a0original spacing.";
  const quote = "Keep the original spacing.";
  assert.deepEqual(keepQuotedItems([{ quote }], text), [{ quote }]);
  const hit = locateQuote(text, quote);
  assert.ok(hit);
  assert.equal(text.slice(hit.start, hit.end), text);
  const suggestion = "keep\u00a0this";
  assert.equal(replaceQuoteOnce(text, quote, suggestion), suggestion);
});

test("a repeated folded quote is not a unique match", () => {
  assert.equal(locateQuote("a\u00a0b and a b", "a b"), null);
  assert.equal(replaceQuoteOnce("a\u00a0b and a b", "a b", "c"), null);
});

test("a new assistant run clears the accepted stamp", () => {
  const chrome = chromeForNewRun();
  assert.equal(chrome.stamp, null);
  assert.equal(chrome.run, null);
  assert.deepEqual(chrome.notes, {});
});
