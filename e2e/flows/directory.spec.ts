import { expect, test } from "@playwright/test";

import { signIn } from "../helpers/auth";

test("submit a listing, approve it as verified, and keep the submission private", async ({ page, request, browser }) => {
  test.skip(!process.env.E2E_FULL, "Needs a seeded local Supabase, Turnstile test keys and an editor session.");
  test.setTimeout(120_000);

  const stamp = Date.now().toString(36);
  const name = `E2E Retreat ${stamp}`;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  expect(url && key).toBeTruthy();

  await page.goto("/directory/submit");
  await page.getByLabel("Organisation name").fill(name);
  await page.getByLabel("Category").selectOption({ label: "Treatment clinic / retreat" });
  await page.getByLabel("Country code").fill("MX");
  await page.getByLabel("City").fill("Tulum");
  await page.getByLabel("Services").fill("retreat");
  await page.getByLabel("Description").fill("A retreat submitted for editorial review.");
  await page.getByLabel("Your email").fill(`e2e-${stamp}@example.com`);
  await page.waitForFunction(() => {
    const input = document.querySelector('input[name="cf-turnstile-response"]') as HTMLInputElement | null;
    return Boolean(input?.value);
  });
  await page.getByRole("button", { name: "Submit listing" }).click();
  await expect(page.getByRole("status")).toContainText("We've received the listing");

  const hidden = await request.get(`${url}/rest/v1/listing_submissions?select=contact_email`, {
    headers: { apikey: key!, Authorization: `Bearer ${key}` },
  });
  expect(hidden.ok()).toBeFalsy();
  expect(await hidden.text()).not.toContain(`e2e-${stamp}@example.com`);

  await page.goto(`/directory?country=MX&category=treatment-clinic&q=${encodeURIComponent(name)}`);
  await expect(page.getByRole("link", { name, exact: true })).toHaveCount(0);

  const editor = await signIn(browser, "editor");
  await editor.page.goto("/admin/directory");
  await editor.page.getByRole("button", { name: `Create draft for ${name}` }).click();
  await expect(editor.page.getByRole("status")).toContainText("Draft created");

  const draft = await request.get(`${url}/rest/v1/directory_listings?select=name,status&name=eq.${encodeURIComponent(name)}`, {
    headers: { apikey: key!, Authorization: `Bearer ${key}` },
  });
  expect(await draft.json()).toEqual([]);

  await editor.page.getByRole("combobox", { name: "Verification", exact: true }).selectOption("verified");
  await editor.page.getByLabel("Verification note").fill("Checked the operator website.");
  await editor.page.getByLabel("Status").selectOption("published");
  await editor.page.getByRole("button", { name: "Save listing" }).click();
  await expect(editor.page.getByRole("status")).toContainText("Saved.");

  await page.goto("/directory?country=MX&category=treatment-clinic");
  const card = page.getByRole("article").filter({ hasText: name });
  await expect(card.getByRole("link", { name, exact: true })).toBeVisible();
  await expect(card.getByTestId("verification-badge")).toHaveText("Verified");
  await expect(card.getByRole("link", { name: "Legal status in Mexico" })).toBeVisible();
  await card.getByRole("link", { name, exact: true }).click();
  await expect(page).toHaveURL(/\/directory\/listing\//);
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByRole("note")).toContainText("Information only — not medical advice.");
  await expect(page.getByRole("link", { name: "Legal status in Mexico" })).toBeVisible();
});
