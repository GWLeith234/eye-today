import assert from "node:assert/strict";
import { test } from "node:test";

import { readAnswers } from "@/lib/survey/model";

import { parseFeedEpisodes, parsePlatformLines, platformFromUrl, platformLines, readPlatformLinks } from "./podcast";

test("platform links parse from lines, dedupe by platform, and round-trip", () => {
  const links = parsePlatformLines("spotify | https://open.spotify.com/show/abc\nhttps://podcasts.apple.com/us/podcast/x\nhttps://www.youtube.com/@ozcast\nspotify | https://open.spotify.com/show/dupe\nhttp://insecure.example/\nbogus | nope");
  assert.deepEqual(links.map((l) => l.platform), ["spotify", "apple", "youtube"]);
  assert.equal(platformFromUrl("https://feeds.transistor.fm/show/rss"), "rss");
  assert.equal(platformFromUrl("https://markgeist.com/"), "other");
  assert.equal(platformLines(readPlatformLinks(links)), "spotify | https://open.spotify.com/show/abc\napple | https://podcasts.apple.com/us/podcast/x\nyoutube | https://www.youtube.com/@ozcast");
  assert.deepEqual(readPlatformLinks([{ platform: "spotify", url: "javascript:alert(1)" }, "junk", { url: "https://ok.example/", platform: "weird" }]), [{ platform: "other", url: "https://ok.example/" }]);
});

test("feed episodes come out of RSS and Atom, newest first as listed, text only", () => {
  const rss = `<?xml version="1.0"?><rss><channel><title>Show</title>
    <item><title><![CDATA[Episode 2 &amp; more]]></title><link>https://example.org/ep2</link><pubDate>Thu, 09 Oct 2026 10:00:00 GMT</pubDate><description><![CDATA[<p>Second <b>one</b>.</p>]]></description><enclosure url="https://example.org/ep2.mp3"/></item>
    <item><title>Episode 1</title><link>http://insecure.example/ep1</link><pubDate>not a date</pubDate><itunes:summary>First.</itunes:summary></item>
  </channel></rss>`;
  const episodes = parseFeedEpisodes(rss, 5);
  assert.deepEqual(episodes, [
    { title: "Episode 2 & more", url: "https://example.org/ep2", publishedOn: "2026-10-09", summary: "Second one." },
    { title: "Episode 1", url: null, publishedOn: null, summary: "First." },
  ]);
  const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>A</title><link rel="alternate" href="https://example.org/a"/><published>2026-10-01T00:00:00Z</published><summary>S</summary></entry></feed>`;
  assert.deepEqual(parseFeedEpisodes(atom), [{ title: "A", url: "https://example.org/a", publishedOn: "2026-10-01", summary: "S" }]);
  assert.equal(parseFeedEpisodes("<html>not a feed</html>").length, 0);
  assert.equal(parseFeedEpisodes(rss, 1).length, 1);
});

test("survey answers keep known keys, drop markup and unknown choices, and need at least one", () => {
  assert.deepEqual(readAnswers({ brought: "  A <b>friend</b>  ", who: "Press", cover: "", extra: "ignored" }), { brought: "A bfriend/b", who: "Press" });
  assert.equal(readAnswers({ who: "Not an option" }), null);
  assert.equal(readAnswers({}), null);
  assert.equal(readAnswers({ cover: "x".repeat(2000) })?.cover?.length, 1000);
});
