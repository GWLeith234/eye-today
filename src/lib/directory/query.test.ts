import assert from "node:assert/strict";
import { test } from "node:test";

import { directoryHref, parseDirectoryFilters, serviceSlugs, splitTags } from "./query";

test("directory filters keep only values the search can use", () => {
  const filters = parseDirectoryFilters({
    q: "  ibogaine <script>  ",
    country: "mx",
    category: "treatment-clinic",
    service: " retreat ",
    verification: "verified",
    page: "2",
  });
  assert.deepEqual(filters, {
    q: "ibogaine script",
    country: "MX",
    category: "treatment-clinic",
    service: "retreat",
    verification: "verified",
    page: 2,
  });
  assert.equal(
    directoryHref(filters),
    "/directory?q=ibogaine+script&country=MX&category=treatment-clinic&service=retreat&verification=verified&page=2",
  );
});

test("directory filters drop junk and stay on page 1", () => {
  const filters = parseDirectoryFilters({
    q: ["<b>"],
    country: "Mexico",
    category: "../admin",
    service: "a".repeat(80),
    verification: "paid",
    page: "0",
  });
  assert.equal(filters.q, "b");
  assert.equal(filters.country, "");
  assert.equal(filters.category, "");
  assert.equal(filters.service, "a".repeat(40));
  assert.equal(filters.verification, "");
  assert.equal(filters.page, 1);
  assert.equal(directoryHref(filters), `/directory?q=b&service=${"a".repeat(40)}`);
});

test("service tags are unique, plain and slug-ready", () => {
  assert.deepEqual(splitTags("Retreat, retreat, <dosing>,  "), ["Retreat", "dosing"]);
  assert.deepEqual(serviceSlugs(["Integration coach", "integration-coach"]), ["integration-coach"]);
});
