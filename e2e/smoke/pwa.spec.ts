import { expect, test } from "@playwright/test";

// The install path had no coverage at all: the manifest, the icons it names and the offline card
// could each 404 and every test would still pass, while readers got a bookmark with browser chrome
// instead of an app. These are cheap and they fail loudly.

test("the web app manifest is served and is installable", async ({ request }) => {
  const response = await request.get("/manifest.webmanifest");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("manifest");

  const manifest = await response.json();
  expect(manifest.name).toBeTruthy();
  // Chrome refuses to install when short_name runs long enough to be elided on a home screen.
  expect(String(manifest.short_name ?? manifest.name).length).toBeLessThanOrEqual(12);
  expect(manifest.start_url).toBeTruthy();
  expect(manifest.display).toBe("standalone");
  expect(manifest.theme_color).toBeTruthy();
  expect(manifest.background_color).toBeTruthy();

  // An installable manifest needs a 192 and a 512, and Android needs a maskable one or it puts the
  // square icon inside its own white circle.
  const icons = manifest.icons ?? [];
  const sizes = icons.map((icon: { sizes?: string }) => icon.sizes);
  expect(sizes).toContain("192x192");
  expect(sizes).toContain("512x512");
  expect(icons.some((icon: { purpose?: string }) => (icon.purpose ?? "").includes("maskable"))).toBe(true);

  // Every icon the manifest promises has to exist.
  for (const icon of icons as { src: string }[]) {
    const file = await request.get(icon.src);
    expect(file.status(), `${icon.src} is missing`).toBe(200);
    expect(file.headers()["content-type"]).toContain("image");
  }
});

test("the service worker and its offline card are served", async ({ request }) => {
  const worker = await request.get("/sw.js");
  expect(worker.status()).toBe(200);
  expect(worker.headers()["content-type"]).toContain("javascript");

  const source = await worker.text();
  expect(source).toContain("addEventListener");
  // A news site must not serve a cached front page. If someone makes navigations cache-first, this
  // is the line that should stop them.
  expect(source).not.toMatch(/caches\.match\(request\)/);

  const offline = await request.get("/offline.html");
  expect(offline.status()).toBe(200);
  const html = await offline.text();
  expect(html).toContain("offline");
});

test("the cover links the manifest and declares itself installable", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
  // This Next emits the standard `mobile-web-app-capable` for metadata.appleWebApp, not the old
  // apple-prefixed name — see node_modules/next/dist/docs, generate-metadata.md.
  await expect(page.locator('meta[name="mobile-web-app-capable"]')).toHaveAttribute("content", "yes");
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute("content", "Eye Today");
});
