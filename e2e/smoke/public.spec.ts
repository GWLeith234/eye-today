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
  "/directory/how-we-verify",
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
  expect(await (await request.get("/robots.txt")).text()).toMatch(/user-agent/i);
  expect(await (await request.get("/sitemap.xml")).text()).toContain("/disclaimer");
});

test("legal pages omit the draft status and keep the publisher notes", async ({ request }) => {
  const privacy = await (await request.get("/privacy")).text();
  expect(privacy).not.toContain("draft-for-legal-review");
  expect(privacy).toContain("PIPEDA");
  expect(await (await request.get("/editorial-policy")).text()).toContain("TODO for the publisher");
  expect(await (await request.get("/disclaimer")).text()).toContain("TODO for the publisher");
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
  // The footer link uses the same opening words. The article's own note is the disclaimer.
  await expect(page.getByRole("note")).toContainText("Information only — not medical advice.");
});

test("report-only CSP does not flag public pages", async ({ page }) => {
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      const record = window as unknown as { __csp?: string[] };
      record.__csp = record.__csp ?? [];
      record.__csp.push(`${event.effectiveDirective} ${event.blockedURI}`);
    });
  });
  for (const path of ["/", "/privacy", "/editorial-policy", "/write-for-us", "/newsletter", "/support", "/search", "/directory"]) {
    await page.goto(path);
    const violations = await page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? []);
    expect(violations, path).toEqual([]);
  }
});

test("security headers are present and CSP is report-only", async ({ request }) => {
  const headers = (await request.get("/")).headers();
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["content-security-policy"]).toBeUndefined();
  const reportOnly = headers["content-security-policy-report-only"];
  expect(reportOnly).toContain("default-src 'self'");
  expect(reportOnly?.split("default-src").length).toBe(2);
});
