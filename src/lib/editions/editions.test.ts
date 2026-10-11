import assert from "node:assert/strict";
import { test } from "node:test";

import { decodeEntities, excerpt, htmlToBlocks, inlineText, wordCount } from "./blocks";
import { buildPages, earlyAccessDays, editionSlug, issueLabel, monthDate, pdfObjectPath, supportersFrom } from "./model";

test("article HTML becomes text blocks and loses everything a PDF cannot show", () => {
  const html = `
    <p>First <strong>bold</strong> &amp; <a href="https://x.test">linked</a> paragraph.</p>
    <figure><img src="https://x.test/a.jpg" alt="x"><figcaption>Caption</figcaption></figure>
    <div data-poll="00000000-0000-4000-8000-000000000001" class="poll-embed">Poll</div>
    <h2>Section head</h2>
    <h3>Sub head</h3>
    <blockquote><p>Quoted line one.</p><p>Quoted line two.</p></blockquote>
    <ul><li>One</li><li>Two<br>lines</li></ul>
    <ol><li>Step</li></ol>
    <iframe src="https://www.youtube.com/embed/abc"></iframe>
    <p>   </p>
    <p>Last&nbsp;&hellip;&#8212;&#x2019;</p>`;
  const blocks = htmlToBlocks(html);
  assert.deepEqual(blocks, [
    { kind: "paragraph", text: "First bold & linked paragraph." },
    { kind: "heading", level: 2, text: "Section head" },
    { kind: "heading", level: 3, text: "Sub head" },
    { kind: "quote", text: "Quoted line one.\nQuoted line two." },
    { kind: "list", ordered: false, items: ["One", "Two lines"] },
    { kind: "list", ordered: true, items: ["Step"] },
    { kind: "paragraph", text: "Last …—’" },
  ]);
  assert.equal(wordCount(blocks), 21);
  assert.equal(excerpt(blocks), "First bold & linked paragraph.");
  assert.equal(excerpt(htmlToBlocks(`<p>${"word ".repeat(80)}</p>`), 60).length <= 61, true);
  assert.deepEqual(htmlToBlocks(""), []);
  assert.deepEqual(htmlToBlocks("<script>alert(1)</script><p>ok</p>"), [{ kind: "paragraph", text: "ok" }]);
});

test("entities and inline tags decode safely", () => {
  assert.equal(decodeEntities("&lt;b&gt; &unknown; &#0;"), "<b> &unknown; &#0;");
  assert.equal(inlineText("<em>a</em>\n\n  <span>b</span>"), "a b");
});

test("edition dates, slugs and paths follow one rule", () => {
  assert.equal(monthDate("2026-10"), "2026-10-01");
  assert.equal(monthDate("2026-13"), null);
  assert.equal(monthDate("garbage"), null);
  assert.equal(editionSlug("2026-10-01"), "2026-10");
  assert.equal(issueLabel("2026-10-01"), "October 2026");
  assert.equal(supportersFrom("2026-10-15T12:00:00.000Z", 3), "2026-10-12T12:00:00.000Z");
  assert.equal(supportersFrom("2026-10-15T12:00:00.000Z", 0), "2026-10-15T12:00:00.000Z");
  assert.equal(earlyAccessDays("2026-10-12T12:00:00.000Z", "2026-10-15T12:00:00.000Z"), 3);
  assert.equal(earlyAccessDays(null, null), 0);
  assert.match(pdfObjectPath("5b0d2fd4-5c3b-4d8a-9d2a-0b6c1d2e3f40"), /^5b0d2fd4-5c3b-4d8a-9d2a-0b6c1d2e3f40\/\d+\.pdf$/);
});

test("the reader's pages are cover, contents, letter when present, then one page per story", () => {
  const stories = [
    { article_slug: "a", title: "A", section_slug: "news", section_name: "News" },
    { article_slug: "b", title: "B", section_slug: "stories", section_name: "Stories" },
  ];
  const withLetter = buildPages({ letter_html: "<p>Hi</p>" }, stories);
  assert.deepEqual(withLetter.map((p) => p.id), ["cover", "contents", "letter", "a", "b"]);
  const noLetter = buildPages({ letter_html: "   " }, stories);
  assert.deepEqual(noLetter.map((p) => p.id), ["cover", "contents", "a", "b"]);
  assert.equal(noLetter[2].kind, "story");
});
