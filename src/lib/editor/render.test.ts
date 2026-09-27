import assert from "node:assert/strict";
import { test } from "node:test";

import { renderArticleHtml, validateArticleJson } from "./render";
import { isAllowedIframeSrc, isAllowedImageSrc, sanitizeArticleHtml } from "./sanitize";

const doc = (...content: unknown[]) => ({ type: "doc", content });
const p = (text: string, marks?: unknown[]) => ({ type: "paragraph", content: [{ type: "text", text, marks }] });

test("text that looks like a script is escaped, never a <script> element", () => {
  const html = renderArticleHtml(doc(p("<script>alert(1)</script>hello")));
  assert.doesNotMatch(html, /<script/i);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;hello/);
});

test("a raw <script>, style and event handlers are stripped by the sanitizer", () => {
  const html = sanitizeArticleHtml(
    '<p onclick="steal()">ok</p><script>alert(1)</script><style>p{}</style><img src="https://x.test/a.png" onerror="alert(2)">',
  );
  assert.doesNotMatch(html, /<script|<style|onclick|onerror/i);
  assert.match(html, /<p>ok<\/p>/);
});

test("javascript: links never survive", () => {
  const html = renderArticleHtml(doc(p("click", [{ type: "link", attrs: { href: "javascript:alert(1)" } }])));
  assert.doesNotMatch(html, /javascript:/i);
});

test("unknown node types in body_json are rejected", () => {
  assert.throws(() => validateArticleJson(doc({ type: "script", content: [{ type: "text", text: "alert(1)" }] })));
});

test("only YouTube / X / Instagram embed iframes are kept", () => {
  const html = sanitizeArticleHtml(
    '<iframe src="https://evil.example/embed"></iframe>' +
      '<iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"></iframe>' +
      '<iframe src="javascript:alert(1)"></iframe>',
  );
  assert.equal((html.match(/<iframe/g) ?? []).length, 1);
  assert.match(html, /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/);
  assert.ok(isAllowedIframeSrc("https://platform.twitter.com/embed/Tweet.html?id=123"));
  assert.ok(!isAllowedIframeSrc("https://platform.twitter.com/embed/Tweet.html?id=123&x=<"));
});

test("editor nodes render to allowed HTML", () => {
  const html = renderArticleHtml(
    doc(
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Head" }] },
      { type: "pullQuote", content: [{ type: "text", text: "Quote" }] },
      { type: "image", attrs: { src: "https://cdn.example/a.png", alt: "A" } },
      { type: "youtube", attrs: { src: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" } },
      { type: "embed", attrs: { provider: "x", url: "https://twitter.com/jack/status/20" } },
      { type: "embed", attrs: { provider: "x", url: "https://evil.example/jack/status/20" } },
    ),
  );
  assert.match(html, /<h2>Head<\/h2>/);
  assert.match(html, /<blockquote data-type="pull-quote" class="pull-quote">Quote<\/blockquote>/);
  assert.match(html, /<img src="https:\/\/cdn\.example\/a\.png" alt="A">/);
  assert.match(html, /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/);
  assert.match(html, /platform\.twitter\.com\/embed\/Tweet\.html\?id=20/);
  assert.equal((html.match(/<iframe/g) ?? []).length, 2);
});

test("images must be https (or this project's Storage)", () => {
  const html = sanitizeArticleHtml('<img src="http://evil.example/a.png" alt="x"><img src="data:image/png;base64,AAAA" alt="y">');
  assert.doesNotMatch(html, /src=/);
  assert.ok(isAllowedImageSrc("https://cdn.example/a.png"));
  assert.ok(!isAllowedImageSrc("javascript:alert(1)"));
});
