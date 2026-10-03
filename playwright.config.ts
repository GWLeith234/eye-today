import os from "node:os";
import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const external = Boolean(process.env.BASE_URL);

// E2E_FULL=1 runs the real journeys against a seeded local Supabase (see docs/sprints/sprint-10b-e2e.md).
// The server and the test workers must agree on where the mock mailbox and the Stripe double write,
// so the switches are set here, once, before either starts.
const full = process.env.E2E_FULL === "1";
if (full) {
  const dir = process.env.E2E_DIR ?? path.join(os.tmpdir(), "eye-today-e2e");
  process.env.EMAIL_PROVIDER = "mock";
  process.env.STRIPE_PROVIDER = "mock";
  process.env.E2E_MAILBOX_DIR ??= dir;
  process.env.E2E_RECORD_DIR ??= dir;
}

// BASE_URL points the read-only smoke project at a deployed site and skips the
// local server. Flow tests are not included in that mode: they submit forms.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  globalSetup: full ? "./e2e/global-setup.ts" : undefined,
  use: { baseURL, trace: "on-first-retry" },
  projects: [
    { name: "smoke", testMatch: /smoke\/.*\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
    ...(external
      ? []
      : [
          { name: "a11y", testMatch: /a11y\/.*\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
          { name: "flows", testMatch: /flows\/.*\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
        ]),
  ],
  webServer: external
    ? undefined
    : {
        command: "npm run start -- --port 3000",
        url: "http://127.0.0.1:3000/",
        reuseExistingServer: !process.env.CI && !full,
        timeout: 120_000,
        env: process.env as Record<string, string>,
      },
});
