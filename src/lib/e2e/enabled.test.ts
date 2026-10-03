import assert from "node:assert/strict";
import { test } from "node:test";

import { e2eSessionAllowed } from "./enabled";

test("the e2e session exists only when the build flag is set", () => {
  assert.equal(e2eSessionAllowed({}), false);
  assert.equal(e2eSessionAllowed({ E2E_FULL: "" }), false);
  assert.equal(e2eSessionAllowed({ E2E_FULL: "0" }), false);
  assert.equal(e2eSessionAllowed({ E2E_FULL: "1", NODE_ENV: "production" }), true);
});
