import assert from "node:assert/strict";
import { test } from "node:test";

import { buildCalendar, escapeText, foldLine, googleCalendarUrl, htmlToText } from "./ics";
import { monthGrid, parseEventFilters, parseMonth, shiftMonth, eventsHref } from "./query";
import { instantToWallTime, isTimeZone, plateDate, utcStamp, wallTimeToInstant } from "./time";

test("Vancouver wall time becomes the right UTC instant in summer and winter", () => {
  const july = wallTimeToInstant("2026-07-01", "19:00", "America/Vancouver");
  const january = wallTimeToInstant("2026-01-15", "19:00", "America/Vancouver");
  assert.ok(july && january);
  assert.equal(utcStamp(july), "20260702T020000Z");
  assert.equal(utcStamp(january), "20260116T030000Z");
  assert.deepEqual(instantToWallTime(july.toISOString(), "America/Vancouver"), { date: "2026-07-01", time: "19:00" });
});

test("wall time rejects junk", () => {
  assert.equal(wallTimeToInstant("2026-02-31", "10:00", "UTC"), null);
  assert.equal(wallTimeToInstant("2026-07-01", "25:00", "UTC"), null);
  assert.equal(wallTimeToInstant("2026-07-01", "10:00", "Mars/Olympus"), null);
  assert.equal(isTimeZone("Africa/Johannesburg"), true);
  assert.equal(isTimeZone("../etc"), false);
});

test("ICS text escaping covers backslash, semicolon, comma and newlines", () => {
  assert.equal(escapeText("a\\b; c, d\ne"), "a\\\\b\\; c\\, d\\ne");
});

test("long lines fold at 75 octets without splitting a character", () => {
  const line = "DESCRIPTION:" + "é".repeat(80);
  const folded = foldLine(line);
  for (const part of folded.split("\r\n")) assert.ok(new TextEncoder().encode(part).length <= 75);
  assert.equal(folded.replace(/\r\n /g, ""), line);
});

test("a calendar has UTC times, a stable UID and escaped text", () => {
  const starts = wallTimeToInstant("2026-07-01", "19:00", "America/Vancouver")!.toISOString();
  const ends = wallTimeToInstant("2026-07-01", "21:00", "America/Vancouver")!.toISOString();
  const body = buildCalendar(
    [
      {
        id: "abc",
        title: "Circle, part 1; a\\b\nsecond",
        starts_at: starts,
        ends_at: ends,
        updated_at: "2026-06-01T00:00:00Z",
        url: "https://theeye.today/events/circle",
        location: "Hall, Vancouver, Canada",
        description: "Bring water.",
      },
    ],
    { name: "Eye Today events", now: new Date("2026-06-02T00:00:00Z") },
  );
  assert.match(body, /^BEGIN:VCALENDAR\r\n/);
  assert.match(body, /\r\nPRODID:-\/\/Eye Today\/\/Events\/\/EN\r\n/);
  assert.match(body, /\r\nUID:abc@eyetoday\r\n/);
  assert.match(body, /\r\nDTSTAMP:20260602T000000Z\r\n/);
  assert.match(body, /\r\nDTSTART:20260702T020000Z\r\n/);
  assert.match(body, /\r\nDTEND:20260702T040000Z\r\n/);
  assert.match(body, /\r\nSUMMARY:Circle\\, part 1\\; a\\\\b\\nsecond\r\n/);
  assert.ok(!body.includes("TZID"));
  assert.match(body, /END:VCALENDAR\r\n$/);
});

test("description HTML becomes calendar text", () => {
  assert.equal(htmlToText("<p>One &amp; two</p><p>Three<br>four</p>"), "One & two\n\nThree\nfour");
});

test("Google link uses the same UTC instants", () => {
  const url = new URL(
    googleCalendarUrl({ title: "Circle", starts_at: "2026-07-02T02:00:00Z", ends_at: "2026-07-02T04:00:00Z", details: "x", location: null }),
  );
  assert.equal(url.hostname, "calendar.google.com");
  assert.equal(url.searchParams.get("dates"), "20260702T020000Z/20260702T040000Z");
});

test("event filters keep only values the query can use", () => {
  assert.deepEqual(parseEventFilters({ type: "retreat", country: "mx", online: "1", when: "past", page: "2" }), {
    type: "retreat",
    country: "MX",
    online: true,
    when: "past",
    page: 2,
  });
  const junk = parseEventFilters({ type: "<x>", country: "Mexico", online: "yes", when: "soon", page: "999999" });
  assert.deepEqual(junk, { type: "", country: "", online: false, when: "upcoming", page: 1 });
  assert.equal(eventsHref({ type: "webinar", country: "", online: true, when: "upcoming", page: 1 }), "/events?type=webinar&online=1");
});

test("month parsing is bounded and the grid starts on Monday", () => {
  const now = new Date("2026-10-10T12:00:00Z");
  assert.deepEqual(parseMonth("", now), { year: 2026, month: 10 });
  assert.deepEqual(parseMonth("2025-03", now), { year: 2025, month: 3 });
  assert.equal(parseMonth("2020-01", now), null);
  assert.equal(parseMonth("2026-13", now), null);
  assert.deepEqual(shiftMonth(2026, 12, 1), { year: 2027, month: 1 });
  assert.deepEqual(shiftMonth(2026, 1, -1), { year: 2025, month: 12 });
  const october = monthGrid(2026, 10); // 1 October 2026 is a Thursday
  assert.deepEqual(october[0], [null, null, null, 1, 2, 3, 4]);
  assert.equal(october.flat().filter(Boolean).length, 31);
});

// The plate is the only place on /events where the date is set in type rather than written out, so
// it has to agree with the sentence beside it. The month-boundary case is the one that shipped
// wrong: a 30 January to 2 February conference claimed to be a one-day event.
test("the date plate keeps both months when an event runs into the next one", () => {
  const across = plateDate("2027-01-30T17:00:00Z", "2027-02-02T23:00:00Z", "America/Chicago");
  assert.deepEqual(across, {
    start: { day: "30", month: "Jan" },
    end: { day: "2", month: "Feb" },
    year: "2027",
  });

  const newYear = plateDate("2026-12-30T17:00:00Z", "2027-01-02T23:00:00Z", "America/Chicago");
  assert.deepEqual(newYear.end, { day: "2", month: "Jan" });
  assert.equal(newYear.year, "2026");
});

test("the date plate prints one day, or a range inside a month", () => {
  const single = plateDate("2027-03-29T14:00:00Z", "2027-03-29T22:00:00Z", "America/New_York");
  assert.deepEqual(single, { start: { day: "29", month: "Mar" }, end: null, year: "2027" });

  const run = plateDate("2027-01-27T15:00:00Z", "2027-01-29T23:00:00Z", "America/Los_Angeles");
  assert.deepEqual(run.end, { day: "29", month: null });
});

test("an event ending at midnight does not claim the following day", () => {
  // Midnight in the event's own zone is the end of the 4th, not the start of the 5th.
  const tz = "America/Regina";
  const midnight = plateDate("2027-07-04T06:00:00Z", "2027-07-05T06:00:00Z", tz);
  assert.equal(midnight.end, null);
  assert.equal(midnight.start.day, "4");

  // A minute past midnight does run on.
  const past = plateDate("2027-07-04T06:00:00Z", "2027-07-05T06:01:00Z", tz);
  assert.deepEqual(past.end, { day: "5", month: null });
});

test("the date plate reads the event's own zone, not the server's", () => {
  // 23:30 UTC on the 3rd is already the 4th in Auckland, and still the 3rd in Denver.
  const auckland = plateDate("2027-05-03T23:30:00Z", "2027-05-04T02:00:00Z", "Pacific/Auckland");
  assert.equal(auckland.start.day, "4");
  const denver = plateDate("2027-05-03T23:30:00Z", "2027-05-04T02:00:00Z", "America/Denver");
  assert.equal(denver.start.day, "3");

  // An unknown zone falls back to UTC rather than throwing.
  assert.equal(plateDate("2027-05-03T23:30:00Z", "2027-05-04T02:00:00Z", "Mars/Olympus").start.day, "3");
});
