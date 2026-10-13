import { expect, test } from "@playwright/test";

import { adminClient } from "../helpers/admin";
import { signIn } from "../helpers/auth";

// Sprint 23 definition of done: a podcast listing shows platform buttons on the directory and the listing page;
// a reader's survey answer lands in Admin → Survey and exports; an issue with only a call to action previews
// with the button and the editor's signoff; /podcasts is a section front.
test("podcast directory, reader survey, single-CTA newsletter", async ({ page, browser }) => {
  test.skip(process.env.E2E_FULL !== "1", "Needs a seeded local Supabase and an editor session.");
  test.setTimeout(180_000);
  const stamp = Date.now().toString(36);
  const db = adminClient();
  const { data: site } = await db.from("sections").select("site_id").limit(1).maybeSingle<{ site_id: string }>();
  const siteId = site!.site_id;
  const { data: category } = await db.from("directory_categories").select("id").eq("site_id", siteId).eq("slug", "podcast").single<{ id: string }>();

  const slug = `e2e-show-${stamp}`;
  try {
    // --- Podcast listing ----------------------------------------------------------------------
    const { error: insertError } = await db.from("directory_listings").insert({
      site_id: siteId,
      category_id: category!.id,
      slug,
      name: `E2E Podcast ${stamp}`,
      country_code: "CA",
      status: "published",
      verification_level: "verified",
      verification_note: "Seeded by the e2e suite.",
      description: "A show about the test suite.",
      host_names: "Test Host",
      platform_links: [
        { platform: "spotify", url: "https://open.spotify.com/show/e2e" },
        { platform: "youtube", url: "https://www.youtube.com/@e2e" },
      ],
    });
    expect(insertError).toBeNull();

    await page.goto("/directory?category=podcast");
    const card = page.locator('[data-testid="listing-card"]', { hasText: `E2E Podcast ${stamp}` });
    await expect(card).toBeVisible();
    await expect(card.getByText("Hosted by Test Host")).toBeVisible();
    await expect(card.getByRole("link", { name: /Spotify/ })).toHaveAttribute("href", "https://open.spotify.com/show/e2e");

    await page.goto(`/directory/listing/${slug}`);
    await expect(page.getByRole("heading", { name: "Listen" })).toBeVisible();
    await expect(page.getByRole("list", { name: "Listen on" }).getByRole("link")).toHaveCount(2);

    // Editor sees and edits the podcast fields. The editor signs the newsletter, so give the e2e editor a name.
    const editor = await signIn(browser, "editor");
    await db.from("profiles").update({ display_name: "E2E Editor" }).eq("id", editor.id);
    const { data: row } = await db.from("directory_listings").select("id").eq("slug", slug).single<{ id: string }>();
    await editor.page.goto(`/admin/directory/${row!.id}`);
    await expect(editor.page.getByLabel("Hosts")).toHaveValue("Test Host");
    await expect(editor.page.getByLabel("Where to listen")).toHaveValue(/spotify \| https:\/\/open\.spotify\.com\/show\/e2e/);

    // --- /podcasts is a section front -------------------------------------------------------------
    const response = await page.goto("/podcasts");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Podcasts");

    // --- Survey -----------------------------------------------------------------------------------
    await page.goto("/survey");
    await page.getByLabel("What brought you to Eye Today?").fill(`The e2e suite ${stamp}`);
    await page.getByLabel("Press").check();
    await page.getByLabel("Your email (optional)").fill(`survey-${stamp}@example.com`);
    await page.waitForFunction(() => {
      const input = document.querySelector('input[name="cf-turnstile-response"]') as HTMLInputElement | null;
      return Boolean(input?.value);
    });
    await page.getByRole("button", { name: "Send my answers" }).click();
    await expect(page.getByRole("status")).toContainText("Thank you");

    await editor.page.goto("/admin/survey");
    await expect(editor.page.getByText(`The e2e suite ${stamp}`)).toBeVisible();
    await expect(editor.page.getByText("Press: ", { exact: false })).toBeVisible();
    const csv = await editor.page.request.get("/admin/survey/export");
    expect(csv.ok()).toBeTruthy();
    expect(await csv.text()).toContain(`survey-${stamp}@example.com`);

    // --- Single-CTA newsletter --------------------------------------------------------------------
    await editor.page.goto("/admin/newsletters");
    await editor.page.getByLabel("New issue for").selectOption({ index: 0 });
    await editor.page.getByRole("button", { name: "Create issue" }).click();
    await expect(editor.page).toHaveURL(/\/admin\/newsletters\/[0-9a-f-]{36}/i);
    await editor.page.getByLabel("Call-to-action heading").fill(`A quick favour ${stamp}`);
    await editor.page.getByLabel("Call-to-action text").fill("Ninety seconds that shape what we cover.");
    await editor.page.getByLabel("Call-to-action link").fill("https://theeye.today/survey");
    await editor.page.getByLabel("Button label").fill("Take the survey");
    await editor.page.getByRole("button", { name: "Save" }).click();
    await expect(editor.page.getByRole("status").last()).toContainText("Saved");
    await editor.page.getByRole("button", { name: "Preview" }).click();
    const frame = editor.page.frameLocator('iframe[title="Newsletter preview"]');
    await expect(frame.getByRole("heading", { name: `A quick favour ${stamp}` })).toBeVisible();
    await expect(frame.getByRole("link", { name: "Take the survey" })).toHaveAttribute("href", "https://theeye.today/survey");
    await expect(frame.getByText("Reply to this email with anything on your mind.")).toBeVisible();
    await expect(frame.getByText("E2E Editor")).toBeVisible();
  } finally {
    await db.from("directory_listings").delete().eq("slug", slug);
    await db.from("reader_surveys").delete().like("email", `survey-${stamp}@example.com`);
    await db.from("newsletter_issues").delete().like("cta_heading", `A quick favour ${stamp}`);
    await db.from("profiles").update({ display_name: null }).eq("display_name", "E2E Editor");
  }
});
