import { expect, test } from "@playwright/test";

import { queryRows } from "../helpers/db";
import { e2eFull } from "../helpers/guard";
import { waitForMail } from "../helpers/mailbox";
import { createTestUser, signInAs, uniqueId } from "../helpers/users";

test("a signed-out contributor is sent to sign in", async ({ page }) => {
  await page.goto("/contribute");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Sign in to Eye Today" })).toBeVisible();
});

test.describe("editorial loop", () => {
  test.skip(!e2eFull(), "Needs E2E_FULL=1 on a seeded local Supabase (the e2e-full CI job).");

  test("submit, request changes, resubmit, publish, and it is on the public site", async ({ browser, baseURL, request }) => {
    test.setTimeout(180_000);

    const run = uniqueId();
    const title = `E2E story ${run}`;
    const slug = `e2e-story-${run}`;
    const firstDraft = `First draft body ${run}.`;
    const revision = `Revised after editor feedback ${run}.`;
    const note = `Please add a source for the claim ${run}.`;

    const contributor = await createTestUser("contributor", "contributor");
    const editor = await createTestUser("editor", "editor");
    const authorContext = await browser.newContext({ baseURL });
    const editorContext = await browser.newContext({ baseURL });
    const author = await authorContext.newPage();
    const desk = await editorContext.newPage();

    const articleId = async () => (await queryRows<{ id: string }>("select id from public.articles where slug = $1", [slug]))[0]?.id;
    const body = author.locator('[aria-label="Article body"]');
    const submit = author.getByRole("button", { name: "Submit for review" });
    // The first submit navigates to /contribute/<id>, which drops the "Submitted for review." toast, so
    // the lasting sign that the story is with the editors is the read-only notice both pages show.
    const withEditors = author.getByText("This story is with the editors (submitted)");
    const status = desk.getByTestId("status");

    await test.step("contributor adds a disclosure and submits a story", async () => {
      await signInAs(author, contributor, "/contribute");
      await expect(author.getByRole("heading", { name: "Contributor desk" })).toBeVisible();

      await author.goto("/contribute/disclosure");
      await author.locator('textarea[name="text"]').fill("I have no financial interest in any clinic mentioned.");
      await author.getByRole("button", { name: "Save disclosure" }).click();
      await expect(author.getByText("Disclosure saved.")).toBeVisible();

      await author.goto("/contribute/new");
      await author.locator('input[name="title"]').fill(title);
      await author.locator('input[name="slug"]').fill(slug);
      await body.click();
      await body.pressSequentially(firstDraft);
      await expect(submit).toBeEnabled();
      await submit.click();
      await expect(withEditors).toBeVisible();
    });

    await test.step("the editors are emailed, and the story is not public yet", async () => {
      const mail = await waitForMail((m) => m.to === editor.email && m.subject === `Story submitted for review: ${title}`);
      expect(mail.text).toContain(title);
      expect((await request.get(`/news/${slug}`)).status()).toBe(404);
    });

    await test.step("editor starts review and requests changes", async () => {
      await signInAs(desk, editor, "/admin/review");
      await desk.getByRole("link", { name: title }).click();
      await expect(status).toHaveText("submitted");
      await expect(desk.getByText("I have no financial interest in any clinic mentioned.")).toBeVisible();

      await desk.getByRole("button", { name: "Start review" }).click();
      await expect(status).toHaveText("in_review");

      await desk.getByLabel("Note to the author").fill(note);
      await desk.getByRole("button", { name: "Request changes" }).click();
      await expect(desk.getByRole("status").filter({ hasText: "Changes requested." })).toBeVisible();
      await expect(status).toHaveText("draft");
    });

    await test.step("the author is emailed the note and sees it on the desk", async () => {
      const mail = await waitForMail((m) => m.to === contributor.email && m.subject === `Changes requested: ${title}`);
      expect(mail.text).toContain(note);

      await author.goto("/contribute");
      await expect(author.getByText(note)).toBeVisible();
    });

    await test.step("contributor edits and resubmits", async () => {
      await author.goto(`/contribute/${await articleId()}`);
      await expect(author.getByRole("region", { name: "Editor notes" })).toContainText(note);
      await expect(body).toContainText(firstDraft);

      await body.click();
      await author.keyboard.press("ControlOrMeta+End");
      await body.pressSequentially(` ${revision}`);
      await expect(submit).toBeEnabled();
      await submit.click();
      await expect(withEditors).toBeVisible();
    });

    await test.step("editor publishes", async () => {
      await desk.goto(`/admin/review/${await articleId()}`);
      await expect(status).toHaveText("submitted");
      await expect(desk.locator(".article-body")).toContainText(revision);

      await desk.getByRole("button", { name: "Publish" }).click();
      await expect(desk.getByRole("status").filter({ hasText: "Published." })).toBeVisible();
      await expect(status).toHaveText("published");

      const mail = await waitForMail((m) => m.to === contributor.email && m.subject === `Published: ${title}`);
      expect(mail.text).toContain(`/news/${slug}`);
    });

    await test.step("a signed-out reader sees it on the public site", async () => {
      const reader = await (await browser.newContext({ baseURL })).newPage();

      await reader.goto(`/news/${slug}`);
      await expect(reader.getByRole("heading", { level: 1, name: title })).toBeVisible();
      await expect(reader.locator("main")).toContainText(revision);
      await expect(reader.getByText("Information only — not medical advice.")).toBeVisible();

      await reader.goto("/");
      await expect(reader.locator(`a[href="/news/${slug}"]`).first()).toBeVisible();
      await reader.goto("/news");
      await expect(reader.locator(`a[href="/news/${slug}"]`).first()).toBeVisible();

      const rss = await (await request.get("/rss.xml")).text();
      expect(rss).toContain(`/news/${slug}`);
    });

    await authorContext.close();
    await editorContext.close();
  });
});
