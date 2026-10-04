import assert from "node:assert/strict";
import { test } from "node:test";

import { parseCoordinates } from "./geo";

test("both empty means no map position", () => {
  assert.deepEqual(parseCoordinates("", "  "), { ok: true, lat: null, lng: null });
});

test("both set and in range is accepted", () => {
  assert.deepEqual(parseCoordinates("20.2114", "-87.4654"), { ok: true, lat: 20.2114, lng: -87.4654 });
  assert.deepEqual(parseCoordinates("-90", "180"), { ok: true, lat: -90, lng: 180 });
  assert.deepEqual(parseCoordinates("0", "0"), { ok: true, lat: 0, lng: 0 });
});

test("one without the other, out of range, or not a number is refused", () => {
  for (const [lat, lng] of [["20", ""], ["", "20"], ["91", "0"], ["0", "181"], ["-90.5", "0"], ["abc", "1"], ["1e3", "1"], ["12,5", "1"]]) {
    assert.equal(parseCoordinates(lat, lng).ok, false, `${lat}, ${lng}`);
  }
});
