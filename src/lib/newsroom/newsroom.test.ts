import assert from "node:assert/strict";
import { test } from "node:test";

import { groupByCategory, isLegalCategory } from "@/lib/directory/legal-map";
import { issueHeading, issueNumberLabel } from "@/lib/editions/model";
import { defaultSubject, newsletterIssueLabel } from "@/lib/newsletter/numbering";
import { nextKeyDate, parseKeyDateLines, readKeyDates, trackerSlug } from "@/lib/tracker/model";

import { BLURB_MAX, cleanBlurb, cleanLinkUrl, dateLabel, decodeEntities, isPrivateHost, isPrivateIp, parseLinkPreview, parseTags, sourceFromUrl } from "./model";

test("news link urls are https, credential-free and lose their fragment", () => {
  assert.equal(cleanLinkUrl(" https://www.example.org/story?id=1#top "), "https://www.example.org/story?id=1");
  assert.equal(cleanLinkUrl("http://example.org/plain"), null);
  assert.equal(cleanLinkUrl("https://user:pw@example.org/"), null);
  assert.equal(cleanLinkUrl("https://example.org/a b"), null);
  assert.equal(cleanLinkUrl("not a url"), null);
  assert.equal(cleanLinkUrl(`https://example.org/${"x".repeat(2000)}`), null);
});

test("private, loopback and metadata hosts are refused for previews", () => {
  for (const host of ["localhost", "api.localhost", "127.0.0.1", "10.1.2.3", "172.16.0.9", "192.168.1.1", "169.254.169.254", "0.0.0.0", "100.64.0.1", "[::1]", "[::]", "printer.local", "box.home.arpa", "[::ffff:7f00:1]", "[::ffff:127.0.0.1]", "[64:ff9b::a9fe:a9fe]", "[fd00::1]", "[fe80::1%eth0]"]) {
    assert.ok(isPrivateHost(host), host);
  }
  for (const host of ["example.org", "172.32.0.1", "11.0.0.1", "100.128.0.1", "www.theguardian.com", "[2606:4700::1111]"]) {
    assert.ok(!isPrivateHost(host), host);
  }
  assert.ok(isPrivateIp("::ffff:a9fe:a9fe"));
  assert.ok(!isPrivateIp("8.8.8.8"));
});

test("link preview reads og tags, falls back to <title> and the host, and never keeps markup", () => {
  const html = `<html><head>
    <meta property="og:title" content="Texas backs &amp; funds ibogaine trials" />
    <meta content="The Texas Tribune" property="og:site_name">
    <meta property="article:published_time" content="2026-10-09T14:03:00Z" />
    <meta name="description" content="A $50 million <b>programme</b> explained.">
    <title>ignored when og:title exists</title></head><body></body></html>`;
  const preview = parseLinkPreview(html, "https://www.texastribune.org/2026/10/09/ibogaine/");
  assert.deepEqual(preview, { title: "Texas backs & funds ibogaine trials", source: "The Texas Tribune", publishedOn: "2026-10-09", description: "A $50 million programme explained." });

  const bare = parseLinkPreview("<html><head><title>  Plain &#8212; headline </title></head></html>", "https://www.example.org/x");
  assert.equal(bare.title, "Plain — headline");
  assert.equal(bare.source, "example.org");
  assert.equal(bare.publishedOn, null);
  assert.equal(bare.description, "");
});

test("blurbs are capped, tags normalised, entities decoded, dates labelled", () => {
  assert.equal(cleanBlurb(`  a <b>bold</b>  claim ${"x".repeat(400)}`).length, BLURB_MAX);
  assert.deepEqual(parseTags("Texas, trials\nPolicy & Law, texas, , Harm Reduction"), ["texas", "trials", "policy-law", "harm-reduction"]);
  assert.equal(parseTags(Array.from({ length: 20 }, (_, i) => `t${i}`).join(",")).length, 10);
  assert.equal(decodeEntities("A &amp; B &lt;c&gt; &#39;d&#x2019; &nbsp;"), "A & B <c> 'd’  ");
  assert.equal(sourceFromUrl("https://www.nature.com/articles/x"), "nature.com");
  assert.equal(dateLabel("2026-10-09"), "9 Oct 2026");
  assert.equal(dateLabel("bad"), "bad");
});

test("legal map categories group in a fixed order and reject unknown values", () => {
  assert.ok(isLegalCategory("prohibited"));
  assert.ok(!isLegalCategory("maybe"));
  const rows = [
    { country_code: "US", title: "", legal_category: "prohibited" as const, as_of: null, source_count: 0, updated_at: "" },
    { country_code: "MX", title: "", legal_category: "unregulated" as const, as_of: "2026-10-01", source_count: 2, updated_at: "" },
  ];
  assert.deepEqual(groupByCategory(rows).map((g) => g.category), ["unregulated", "prohibited"]);
});

test("tracker key dates parse, round-trip and pick the next due date", () => {
  const dates = parseKeyDateLines("Comments close | 2026-11-20\nbad line\n2026-01-05\nResults | not-a-date");
  assert.deepEqual(dates, [{ label: "Comments close", date: "2026-11-20" }, { label: "Date", date: "2026-01-05" }]);
  assert.deepEqual(readKeyDates([{ label: "<x>Signed", date: "2025-06-11" }, { date: "nope" }, "junk"]), [{ label: "xSigned", date: "2025-06-11" }]);
  assert.deepEqual(nextKeyDate(dates, "2026-10-11"), { label: "Comments close", date: "2026-11-20" });
  assert.deepEqual(nextKeyDate(dates, "2027-01-01"), { label: "Comments close", date: "2026-11-20" });
  assert.equal(nextKeyDate([], "2026-10-11"), null);
  assert.equal(trackerSlug("FDA request for information — Ibogaine (2026)"), "fda-request-for-information-ibogaine-2026");
});

test("issue numbering reads as Issue No. N and Week N", () => {
  assert.equal(issueNumberLabel(1), "Issue No. 1");
  assert.equal(issueNumberLabel(null), null);
  assert.equal(issueHeading(1, "2026-10-01"), "Issue No. 1 · October 2026");
  assert.equal(issueHeading(null, "2026-10-01"), "October 2026");
  assert.equal(newsletterIssueLabel("weekly", 12), "Week 12");
  assert.equal(newsletterIssueLabel("daily", 34), "No. 34");
  assert.equal(newsletterIssueLabel("weekly", null), null);
  assert.equal(defaultSubject("Weekly Roundup", "weekly", 12, "12 Oct 2026"), "Eye Today · Week 12 — 12 Oct 2026");
  assert.equal(defaultSubject("Weekly Roundup", "weekly", null, "12 Oct 2026"), "Weekly Roundup — 12 Oct 2026");
});
