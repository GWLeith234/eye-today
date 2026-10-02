import assert from "node:assert/strict";
import { test } from "node:test";

import { renderContentMarkdown } from "./content-doc";

test("legal markdown drops front matter, scripts and unsafe links", () => {
  const doc = renderContentMarkdown(
    [
      "---",
      "status: draft-for-legal-review",
      "updated: 2026-10-02",
      "---",
      "",
      "Hello <script>alert(1)</script> and <iframe src=\"https://evil.example\"></iframe>.",
      "",
      "A [safe](https://example.com/path) link, a [local](/disclaimer) link and a [bad](javascript:alert(1)) one.",
      "",
      "> TODO for the publisher: write this paragraph.",
    ].join("\n"),
  );

  assert.equal(doc.status, "draft-for-legal-review");
  assert.equal(doc.updated, "2026-10-02");
  assert.ok(!doc.html.includes("draft-for-legal-review"));
  assert.ok(!doc.html.includes("<script"));
  assert.ok(!doc.html.includes("<iframe"));
  assert.ok(!doc.html.includes("javascript:"));
  assert.match(doc.html, /href="https:\/\/example.com\/path"/);
  assert.match(doc.html, /href="\/disclaimer"/);
  assert.match(doc.html, /TODO for the publisher/);
});

test("a missing front matter still renders the body", () => {
  const doc = renderContentMarkdown("## Heading\n\n- One\n- Two");
  assert.equal(doc.status, null);
  assert.match(doc.html, /<h2>Heading<\/h2>/);
  assert.match(doc.html, /<ul><li>One<\/li><li>Two<\/li><\/ul>/);
});
