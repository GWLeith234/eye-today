import { expect, test } from "@playwright/test";

import { signIn } from "../helpers/auth";

// Definition of done: submit → editor approves → on /events (list and calendar), on the cover rail and on the
// linked listing, and the .ics carries the right UTC instant.
test("an organiser submits an event, an editor approves it, and it appears everywhere with the right time", async ({ page, request, browser }) => {
  test.skip(!process.env.E2E_FULL, "Needs a seeded local Supabase, Turnstile test keys and editor and reader sessions.");
  test.setTimeout(150_000);

  const stamp = Date.now().toString(36);
  const title = `E2E Circle ${stamp}`;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  expect(url && key).toBeTruthy();

  // Next July, 19:00 in Vancouver (PDT, UTC-7) is 02:00 UTC the next day.
  const year = new Date().getUTCFullYear() + 1;
  const expectedStart = `DTSTART:${year}0702T020000Z`;

  const reader = await signIn(browser, "reader");
  await reader.page.goto("/events/submit");
  await reader.page.getByLabel("Event name").fill(title);
  await reader.page.getByLabel("Type", { exact: true }).selectOption("integration_circle");
  await reader.page.getByLabel("In person").check();
  await reader.page.getByLabel("Start date").fill(`${year}-07-01`);
  await reader.page.getByLabel("Start time").fill("19:00");
  await reader.page.getByLabel("End time").fill("21:00");
  await reader.page.getByLabel("Time zone the times are in").fill("America/Vancouver");
  await reader.page.getByLabel("City", { exact: true }).fill("Vancouver");
  await reader.page.getByLabel("Country code").fill("CA");
  await reader.page.getByLabel("Organiser", { exact: true }).fill("E2E Organiser");
  await reader.page.getByLabel("Registration link").fill("https://example.com/register");
  await reader.page.getByLabel("Directory listing (optional)").fill("zed-clinic");
  await reader.page.getByLabel("Description", { exact: true }).fill("A circle for people after treatment.");
  await reader.page.waitForFunction(() => {
    const input = document.querySelector('input[name="cf-turnstile-response"]') as HTMLInputElement | null;
    return Boolean(input?.value);
  });
  await reader.page.getByRole("button", { name: "Submit event" }).click();
  await expect(reader.page).toHaveURL(/\/account\/events\?submitted=1/);
  await expect(reader.page.getByTestId("own-event").filter({ hasText: title })).toContainText("Waiting for review");

  // Anon cannot read the table, and the pending event is not public.
  const hidden = await request.get(`${url}/rest/v1/events?select=title,contact_email`, {
    headers: { apikey: key!, Authorization: `Bearer ${key}` },
  });
  expect(await hidden.text()).not.toContain(title);
  await page.goto("/events");
  await expect(page.getByRole("link", { name: title, exact: true })).toHaveCount(0);

  const editor = await signIn(browser, "editor");
  await editor.page.goto("/admin/events");
  const row = editor.page.locator("li[data-event-id]").filter({ hasText: title });
  await row.getByRole("button", { name: "Approve" }).click();
  await expect(editor.page.getByRole("status")).toContainText("Event published");

  await page.goto("/events");
  const link = page.getByRole("link", { name: title, exact: true });
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(/\/events\/e2e-circle-/);
  const slug = new URL(page.url()).pathname.split("/").pop()!;
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await expect(page.getByRole("note")).toContainText("Information only — not medical advice.");
  await expect(page.getByRole("link", { name: "Zed Clinic" })).toBeVisible();

  await page.goto(`/events?view=calendar&month=${year}-07`);
  await expect(page.getByRole("table").getByRole("link", { name: title })).toBeVisible();

  await page.goto("/");
  await expect(page.getByRole("region", { name: "Upcoming events" }).getByRole("link", { name: title })).toBeVisible();

  await page.goto("/directory/listing/zed-clinic");
  await expect(page.getByRole("region", { name: "Upcoming events" }).getByRole("link", { name: title })).toBeVisible();

  const ics = await request.get(`/events/${slug}/event.ics`);
  expect(ics.status()).toBe(200);
  expect(ics.headers()["content-type"]).toContain("text/calendar");
  const body = await ics.text();
  expect(body).toContain(expectedStart);
  expect(body).toContain(`DTEND:${year}0702T040000Z`);
  expect(body).not.toContain("TZID");

  const feed = await request.get("/events.ics");
  expect(await feed.text()).toContain(expectedStart);
});
