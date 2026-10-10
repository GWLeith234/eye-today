import { expect, test } from "@playwright/test";

import { signIn } from "../helpers/auth";

// The assistant is not configured in this job, so nothing here calls Anthropic: a new reader's
// comment saves and stays pending, which is the behaviour under test.
test("a reader's comment waits for an editor and then shows with their name", async ({ page, browser }) => {
  test.skip(!process.env.E2E_FULL, "Needs a seeded local Supabase and editor and reader sessions.");
  test.setTimeout(120_000);

  const stamp = Date.now().toString(36);
  const text = `E2E comment ${stamp}: what did the trial measure?`;
  const articleId = "00000000-0000-4000-8000-000000000201";
  const story = "/news/welcome-to-eye-today";

  const editor = await signIn(browser, "editor");
  await editor.page.goto("/admin/comments");
  await editor.page.getByLabel(/Reader comments on for the whole site/).check();
  await editor.page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(editor.page.getByRole("status")).toContainText("Saved");

  await editor.page.goto(`/admin/articles/${articleId}`);
  await editor.page.getByLabel(/Allow reader comments/).check();
  await editor.page.getByRole("button", { name: "Save", exact: true }).first().click();
  await expect(editor.page.getByText("Saved.")).toBeVisible();

  const reader = await signIn(browser, "reader");
  await reader.page.goto("/account");
  await reader.page.getByLabel("Display name").fill("E2E Reader");
  await reader.page.getByRole("button", { name: "Save profile" }).click();
  // Wait for the save to land, or the comment can be posted under the old name.
  await expect(reader.page).toHaveURL(/saved=profile/);

  await reader.page.goto(story);
  await expect(reader.page.getByRole("heading", { name: "Comments" })).toBeVisible();
  await reader.page.getByLabel("Add a comment").fill(text);
  await reader.page.getByRole("button", { name: "Post comment" }).click();
  await expect(reader.page.getByRole("status").filter({ hasText: "being reviewed" })).toBeVisible();
  await expect(reader.page.getByText("Held for review")).toBeVisible();

  // The public story does not show it.
  await page.goto(story);
  await expect(page.getByRole("heading", { name: "Comments" })).toBeVisible();
  await expect(page.getByText(text)).toHaveCount(0);

  await editor.page.goto("/admin/comments");
  const row = editor.page.locator("li[data-comment-id]").filter({ hasText: text });
  await expect(row).toBeVisible();
  const id = await row.first().getAttribute("data-comment-id");
  await editor.page.locator(`li:has(form):has-text("${text.slice(0, 40)}")`).getByRole("button", { name: "Approve" }).first().click();
  await expect(editor.page.getByRole("status")).toContainText("Saved");
  expect(id).toBeTruthy();

  await page.goto(story);
  // Scoped to the comments region: the story itself is an <article> that contains every comment.
  const published = page.locator("#comments article[data-comment-id]").filter({ hasText: text });
  await expect(published).toBeVisible();
  await expect(published).toContainText("E2E Reader");
});
