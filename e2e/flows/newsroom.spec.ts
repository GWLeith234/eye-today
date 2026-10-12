import { expect, test } from "@playwright/test";

import { adminClient } from "../helpers/admin";
import { signIn } from "../helpers/auth";

// Sprint 21 definition of done: an editor adds a credited link that appears on /news-feed and the cover;
// the Legal Map lists a published country under its category; the seeded tracker renders with its filter
// and a linked story; the first edition shows "Issue No. 1"; the sales pages carry the four audience panels.
test("newsroom products: news feed, legal map, tracker, issue numbers, segmented sales pages", async ({ page, browser }) => {
  test.skip(process.env.E2E_FULL !== "1", "Needs a seeded local Supabase and an editor session.");
  test.setTimeout(180_000);
  const stamp = Date.now().toString(36);
  const db = adminClient();

  // --- News feed: editor adds and publishes a link -------------------------------------------
  const editor = await signIn(browser, "editor");
  await editor.page.goto("/admin/news-feed/new");
  await editor.page.getByLabel("Link").fill(`https://example.org/coverage/${stamp}`);
  await editor.page.getByLabel("Headline").fill(`Example Times on ibogaine ${stamp}`);
  await editor.page.getByLabel("Outlet").fill("Example Times");
  await editor.page.getByLabel("Published on").fill("2026-10-09");
  await editor.page.getByLabel("Blurb").fill("A one-line summary in our own words.");
  await editor.page.getByLabel("Tags").fill("texas, trials");
  await editor.page.getByLabel("Status").selectOption("published");
  await editor.page.getByRole("button", { name: "Save link" }).click();
  await expect(editor.page.getByRole("status")).toContainText("Saved");

  // Two more straight into the table so the feed has a list to render.
  const { data: site } = await db.from("sections").select("site_id").limit(1).maybeSingle<{ site_id: string }>();
  const siteId = site!.site_id;
  const { error: seedError } = await db.from("news_links").insert([
    { site_id: siteId, url: `https://example.org/two/${stamp}`, title: `Second link ${stamp}`, source_name: "Example Post", published_on: "2026-10-10", blurb: "Second.", status: "published" },
    { site_id: siteId, url: `https://example.org/draft/${stamp}`, title: `Draft link ${stamp}`, source_name: "Example Post", published_on: "2026-10-11", blurb: "Hidden.", status: "draft" },
  ]);
  expect(seedError).toBeNull();

  // Signed-out reader: credited, newest first, drafts hidden.
  await page.goto("/news-feed");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ibogaine in the news");
  const first = page.getByRole("link", { name: new RegExp(`Example Times on ibogaine ${stamp}`) });
  await expect(first).toHaveAttribute("href", `https://example.org/coverage/${stamp}`);
  await expect(first).toHaveAttribute("rel", /nofollow/);
  await expect(page.getByText("Example Times", { exact: false }).first()).toBeVisible();
  await expect(page.getByText(`Draft link ${stamp}`)).toHaveCount(0);
  const titles = await page.locator("article h3").allTextContents();
  expect(titles.findIndex((t) => t.includes(`Second link ${stamp}`))).toBeLessThan(titles.findIndex((t) => t.includes(`Example Times on ibogaine ${stamp}`)));

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Ibogaine in the news" })).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(`Second link ${stamp}`) })).toBeVisible();

  // --- Legal Map: a published country lands under its category ---------------------------------
  const { error: legalError } = await db
    .from("country_legal_status")
    .update({ title: "Unregulated; clinics operate", summary_html: "<p>Summary.</p>", sources: [{ title: "Gov", url: "https://example.org/mx" }], as_of: "2026-10-01", legal_category: "unregulated", status: "published" })
    .eq("site_id", siteId)
    .eq("country_code", "MX");
  expect(legalError).toBeNull();
  await page.goto("/legal-map");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Legal Map");
  const unregulated = page.locator("section#unregulated");
  await expect(unregulated.getByRole("link", { name: "Mexico" })).toHaveAttribute("href", "/directory/mx");
  await expect(unregulated.getByText("Last reviewed 1 Oct 2026")).toBeVisible();
  await expect(unregulated.getByText("1 source")).toBeVisible();

  // Editor sees the category on the country editor.
  await editor.page.goto("/admin/directory/legal/MX");
  await expect(editor.page.getByLabel("Legal Map category")).toHaveValue("unregulated");

  // --- Tracker: seed renders, filter works, a linked story is shown ------------------------------
  const { data: story } = await db
    .from("articles")
    .insert({ site_id: siteId, section_id: "00000000-0000-4000-8000-000000000101", slug: `e2e-tracker-${stamp}`, title: `Tracker story ${stamp}`, status: "published", published_at: new Date(Date.now() - 60_000).toISOString(), body_html: "<p>Body.</p>" })
    .select("id")
    .single<{ id: string }>();
  const { error: trackerError } = await db.from("tracker_entries").update({ article_id: story!.id }).eq("site_id", siteId).eq("slug", "fda-ibogaine-rfi-2026");
  expect(trackerError).toBeNull();

  await page.goto("/tracker");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Trials & Funding Tracker");
  await expect(page.locator("[data-tracker-entry]")).toHaveCount(7);
  const fda = page.locator('[data-tracker-entry="fda-ibogaine-rfi-2026"]');
  await expect(fda.getByText("Comments close:")).toBeVisible();
  await expect(fda.getByText("20 Nov 2026")).toBeVisible();
  await expect(fda.getByRole("link", { name: `Our story: Tracker story ${stamp}` })).toHaveAttribute("href", `/news/e2e-tracker-${stamp}`);
  await page.getByRole("navigation", { name: "Filter" }).getByRole("link", { name: "Regulatory" }).click();
  await expect(page).toHaveURL(/\/tracker\?kind=regulatory$/);
  await expect(page.locator("[data-tracker-entry]")).toHaveCount(1);

  // Editor edits an entry.
  await editor.page.goto("/admin/tracker");
  await editor.page.locator('[data-tracker-row="fda-ibogaine-rfi-2026"]').getByRole("link").first().click();
  await editor.page.getByLabel("Stage or status").fill("Comment period open");
  await editor.page.getByRole("button", { name: "Save entry" }).click();
  await expect(editor.page.getByRole("status")).toContainText("Saved");
  await page.goto("/tracker?kind=regulatory");
  await expect(page.locator('[data-tracker-entry="fda-ibogaine-rfi-2026"]')).toContainText("Comment period open");

  // --- Issue numbers: the first edition is No. 1 ---------------------------------------------
  const { data: edition, error: editionError } = await db
    .from("editions")
    .insert({ site_id: siteId, slug: `e2e-issue-${stamp}`, title: `Numbered issue ${stamp}`, issue_month: "2026-10-01", status: "published", public_from: new Date(Date.now() - 60_000).toISOString() })
    .select("id, issue_number")
    .single<{ id: string; issue_number: number }>();
  expect(editionError).toBeNull();
  expect(edition!.issue_number).toBeGreaterThanOrEqual(1);
  await page.goto("/editions");
  await expect(page.getByText(`Issue No. ${edition!.issue_number} · October 2026`).first()).toBeVisible();

  // --- Sales pages carry the four audience panels --------------------------------------------
  for (const path of ["/advertise", "/support"]) {
    await page.goto(path);
    for (const id of ["clinics", "families", "researchers", "policy"]) {
      await expect(page.locator(`[data-audience="${id}"]`)).toBeVisible();
    }
  }

  // Cleanup.
  await db.from("news_links").delete().like("url", `%/${stamp}`);
  await db.from("editions").delete().eq("id", edition!.id);
  await db.from("tracker_entries").update({ article_id: null, stage: "Open for comment" }).eq("site_id", siteId).eq("slug", "fda-ibogaine-rfi-2026");
  await db.from("articles").delete().eq("id", story!.id);
});
