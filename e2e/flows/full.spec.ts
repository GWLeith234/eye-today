import { expect, test } from "@playwright/test";

// Skipped Playwright tests exit 0. This fails the e2e job if the journeys were not turned on.
test("CI runs the full journeys", () => {
  test.skip(!process.env.CI, "Local runs may omit E2E_FULL.");
  expect(process.env.E2E_FULL).toBe("1");
});
