import { expect, test } from "@playwright/test";

const PAGES = [
  "/",
  "/about",
  "/contact",
  "/advertise",
  "/ad-policy",
  "/write-for-us",
  "/editorial-policy",
  "/corrections",
  "/disclaimer",
  "/privacy",
  "/terms",
  "/newsletter",
  "/support",
  "/search",
];

test("public pages return 200", async ({ request }) => {
  for (const path of PAGES) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
  }
});

test("an unknown URL is the custom 404", async ({ page }) => {
  const response = await page.goto("/this-page-does-not-exist");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await expect(page.getByLabel("Search")).toBeVisible();
  await expect(page.getByText("draft-for-legal-review")).toHaveCount(0);
});

test("robots, sitemap and rss respond", async ({ request }) => {
  for (const path of ["/robots.txt", "/sitemap.xml", "/rss.xml"]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
  }
  expect(await (await request.get("/robots.txt")).text()).toContain("User-agent");
  expect(await (await request.get("/sitemap.xml")).text()).toContain("/disclaimer");
});

test("health reports the database when a real one is required", async ({ request }) => {
  const response = await request.get("/api/health");
  const body = (await response.json()) as { db?: string };
  if (process.env.SMOKE_REQUIRE_DB) {
    expect(response.status()).toBe(200);
    expect(body.db).toBe("ok");
  } else {
    expect(["ok", "error"]).toContain(body.db);
  }
});

test("a published article shows the medical disclaimer", async ({ page }) => {
  await page.goto("/");
  const hrefs = await page.locator("a[href]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href") ?? ""));
  const article = hrefs.find((href) => /^\/[a-z0-9-]+\/[a-z0-9-]+$/.test(href));
  test.skip(!article, "No published article to open");
  await page.goto(article!);
  await expect(page.getByText("Information only — not medical advice.")).toBeVisible();
});

test("security headers are present and CSP is report-only", async ({ request }) => {
  const headers = (await request.get("/")).headers();
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["content-security-policy"]).toBeUndefined();
  expect(headers["content-security-policy-report-only"]).toContain("default-src 'self'");
});
