import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const external = Boolean(process.env.BASE_URL);

// BASE_URL points the read-only smoke project at a deployed site and skips the
// local server. Flow tests are not included in that mode: they submit forms.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
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
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
