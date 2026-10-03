import { expect, test } from "@playwright/test";

import { signIn } from "../helpers/auth";

test("a signed-out contributor is sent to sign in", async ({ page }) => {
  await page.goto("/contribute");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Sign in to Eye Today" })).toBeVisible();
});

test("submit, request changes, resubmit and publish", async ({ browser }) => {
  test.skip(!process.env.E2E_FULL, "Needs a seeded local Supabase and signed-in contributor and editor.");
  test.setTimeout(120_000);

  const stamp = Date.now().toString(36);
  const title = `E2E clinic report ${stamp}`;
  const slug = `e2e-clinic-${stamp}`;

  const editor = await signIn(browser, "editor");
  const contributor = await signIn(browser, "contributor");

  await contributor.page.goto("/contribute/disclosure");
  await contributor.page.getByLabel("Disclosure").fill("No affiliations");
  await contributor.page.getByRole("button", { name: "Save disclosure" }).click();
  await expect(contributor.page.getByText("Disclosure saved.")).toBeVisible();

  await contributor.page.goto("/contribute/new");
  await contributor.page.getByRole("textbox", { name: "Title", exact: true }).fill(title);
  await contributor.page.getByLabel("Slug").fill(slug);
  await contributor.page.getByLabel("Section").selectOption({ label: "News" });
  await expect(contributor.page.getByText("Loading editor…")).toHaveCount(0);
  await contributor.page.getByLabel("Article body").click();
  await contributor.page.keyboard.type("The clinic report names the operator and the city.");
  await expect(contributor.page.getByRole("button", { name: "Submit for review" })).toBeEnabled();
  await contributor.page.getByRole("button", { name: "Submit for review" }).click();
  await expect(contributor.page).toHaveURL(/\/contribute\/[0-9a-f-]{36}/i);
  // The flash message lives in client state and is dropped by the navigation to the new id.
  await expect(contributor.page.getByTestId("status")).toHaveText("submitted");
  const id = new URL(contributor.page.url()).pathname.split("/").pop() ?? "";

  await editor.page.goto(`/admin/review/${id}`);
  await editor.page.getByLabel("Note to the author").fill("Please name the clinic.");
  await editor.page.getByRole("button", { name: "Request changes" }).click();
  await expect(editor.page.getByText("Changes requested.")).toBeVisible();

  await contributor.page.goto("/contribute");
  await expect(contributor.page.getByRole("listitem").filter({ hasText: title }).getByText("Please name the clinic.")).toBeVisible();
  await contributor.page.getByRole("link", { name: title }).click();
  await expect(contributor.page.getByText("Loading editor…")).toHaveCount(0);
  await expect(contributor.page.getByRole("button", { name: "Submit for review" })).toBeEnabled();
  await contributor.page.getByRole("button", { name: "Submit for review" }).click();
  await expect(contributor.page.getByTestId("status")).toHaveText("submitted");

  await editor.page.goto(`/admin/review/${id}`);
  await editor.page.getByRole("button", { name: "Publish" }).click();
  await expect(editor.page.getByText("Published.")).toBeVisible();

  const reader = await browser.newContext();
  const page = await reader.newPage();
  await page.goto(`/news/${slug}`);
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await reader.close();
  await editor.page.context().close();
  await contributor.page.context().close();
});
