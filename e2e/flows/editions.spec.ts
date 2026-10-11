import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { signIn } from "../helpers/auth";

const SITE = "00000000-0000-4000-8000-000000000001";
const NEWS = "00000000-0000-4000-8000-000000000101";

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const BODY = "<h2>What happened</h2><p>" + "Readers asked for a monthly issue, so here it is. ".repeat(30) + "</p><ul><li>First point</li><li>Second point</li></ul>";

// Definition of done: build an issue from 6 published stories → publish → it appears in /editions, pages
// through on mobile, and the PDF downloads with the cover, contents and stories.
test("an editor builds and publishes a six-story edition that readers page through and download", async ({ page, browser }) => {
  test.skip(process.env.E2E_FULL !== "1", "Needs a seeded local Supabase and an editor session.");
  test.setTimeout(180_000);
  const stamp = Date.now().toString(36);
  const db = admin();

  const titles = Array.from({ length: 6 }, (_, i) => `E2E edition story ${stamp} ${i + 1}`);
  const { data: inserted, error } = await db
    .from("articles")
    .insert(
      titles.map((title, i) => ({
        site_id: SITE,
        section_id: NEWS,
        slug: `e2e-edition-${stamp}-${i + 1}`,
        title,
        dek: `Dek ${i + 1}`,
        status: "published",
        published_at: new Date(Date.now() - (10 - i) * 60_000).toISOString(),
        body_html: BODY,
      })),
    )
    .select("id");
  expect(error).toBeNull();
  expect(inserted?.length).toBe(6);

  const editor = await signIn(browser, "editor");
  const slug = `e2e-${stamp}`;
  await editor.page.goto("/admin/editions/new");
  await editor.page.getByLabel("Title").fill(`The ${stamp} issue`);
  await editor.page.getByLabel("Issue month").fill("2026-10");
  await editor.page.getByLabel("Slug").fill(slug);
  await editor.page.getByLabel("Editor’s letter").fill("Welcome to the issue.\n\nSix stories, one place.");
  for (const title of titles) {
    await editor.page.getByLabel("Add a story").fill(title);
    await editor.page.getByRole("list", { name: "Published stories" }).getByRole("button", { name: "Add" }).first().click();
  }
  const chosen = editor.page.getByRole("list", { name: "Stories in this issue" });
  await expect(chosen.getByRole("listitem")).toHaveCount(6);
  // Reorder: the last story goes up one place, and the order is what gets saved.
  await editor.page.getByRole("button", { name: `Move ${titles[5]} up` }).click();
  await editor.page.getByLabel("Status").selectOption("published");
  await editor.page.getByLabel("Public from (UTC)").fill(new Date(Date.now() - 60_000).toISOString().slice(0, 16));
  await editor.page.getByLabel("Supporter early access (days)").fill("0");
  await editor.page.getByRole("button", { name: "Save edition" }).click();
  await expect(editor.page.getByRole("status")).toContainText("Edition saved");
  const editionId = new URL(editor.page.url()).pathname.split("/").pop()!;
  expect(editionId).toMatch(/^[0-9a-f-]{36}$/);
  await expect(editor.page.getByRole("list", { name: "Stories in this issue" }).getByRole("listitem").nth(4)).toContainText(titles[5]);

  await editor.page.getByRole("button", { name: "Generate PDF" }).click();
  await expect(editor.page.getByRole("status").filter({ hasText: "PDF generated" })).toBeVisible({ timeout: 60_000 });

  // A signed-out reader, on a phone.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/editions");
  await page.getByRole("link", { name: `The ${stamp} issue` }).click();
  await expect(page).toHaveURL(new RegExp(`/editions/${slug}$`));
  const reader = page.getByTestId("edition-reader");
  await expect(reader.getByRole("heading", { level: 1, name: `The ${stamp} issue` })).toBeVisible();
  await expect(reader.getByText("1 / 9")).toBeVisible();

  await reader.getByRole("button", { name: "Start reading" }).click();
  await expect(reader.getByRole("heading", { name: "Contents" })).toBeVisible();
  await expect(reader.getByRole("navigation", { name: "Contents" }).getByRole("link")).toHaveCount(7);
  await expect(page).toHaveURL(/#contents$/);

  await page.keyboard.press("ArrowRight");
  await expect(reader.getByRole("heading", { name: "A letter from the editor" })).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(reader.getByRole("heading", { name: titles[0] })).toBeVisible();
  await expect(reader.getByText("4 / 9")).toBeVisible();

  // Deep link to the reordered story, then swipe forward.
  await page.goto(`/editions/${slug}#e2e-edition-${stamp}-6`);
  await expect(reader.getByRole("heading", { name: titles[5] })).toBeVisible();
  await expect(reader.getByText("8 / 9")).toBeVisible();
  await reader.dispatchEvent("touchstart", { touches: [{ clientX: 300, clientY: 400 }] });
  await reader.dispatchEvent("touchend", { changedTouches: [{ clientX: 100, clientY: 405 }] });
  await expect(reader.getByRole("heading", { name: titles[4] })).toBeVisible();
  await expect(reader.getByText("9 / 9")).toBeVisible();
  await expect(reader.getByRole("button", { name: "Next page" })).toBeDisabled();

  // The PDF: a real document with the cover, the contents, the letter and six story pages.
  const response = await page.request.get(`/editions/${slug}/pdf`);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("application/pdf");
  expect(response.headers()["cache-control"]).toContain("no-store");
  const bytes = await response.body();
  expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  const pages = bytes.toString("latin1").match(/\/Type\s*\/Page(?![s\w])/g)?.length ?? 0;
  expect(pages).toBeGreaterThanOrEqual(9);
  expect(bytes.toString("latin1")).toContain("/Title");

  // Early access: supporters (and editors) see it; the public does not, and the PDF route agrees.
  const { error: earlyError } = await db
    .from("editions")
    .update({ public_from: new Date(Date.now() + 86_400_000).toISOString(), supporters_from: new Date(Date.now() - 60_000).toISOString() })
    .eq("id", editionId);
  expect(earlyError).toBeNull();
  await page.goto("/editions");
  await expect(page.getByRole("link", { name: `The ${stamp} issue` })).toHaveCount(0);
  expect((await page.request.get(`/editions/${slug}`)).status()).toBe(404);
  expect((await page.request.get(`/editions/${slug}/pdf`)).status()).toBe(404);
  await editor.page.goto(`/editions/${slug}`);
  await expect(editor.page.getByTestId("edition-reader").getByText("Supporter early access")).toBeVisible();
  expect((await editor.page.request.get(`/editions/${slug}/pdf`)).status()).toBe(200);

  await db.from("editions").delete().eq("id", editionId);
  await db.from("articles").delete().in("id", (inserted ?? []).map((row) => row.id));
});
