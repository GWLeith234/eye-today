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

// Definition of done, part 1: a poll embedded in a story takes one vote from a signed-out browser and shows results.
test("a signed-out reader votes once in an embedded poll and sees the results", async ({ page, browser }) => {
  test.skip(process.env.E2E_FULL !== "1", "Needs a seeded local Supabase and an editor session.");
  test.setTimeout(120_000);
  const stamp = Date.now().toString(36);
  const question = `E2E poll ${stamp}: is integration care covered enough?`;

  const editor = await signIn(browser, "editor");
  await editor.page.goto("/admin/polls/new");
  await editor.page.getByLabel("Question").fill(question);
  await editor.page.getByLabel("Option 1", { exact: true }).fill("Yes");
  await editor.page.getByLabel("Option 2", { exact: true }).fill("No");
  await editor.page.getByRole("button", { name: "Save poll" }).click();
  await expect(editor.page.getByRole("status")).toContainText("Poll saved");
  const pollId = new URL(editor.page.url()).pathname.split("/").pop()!;
  expect(pollId).toMatch(/^[0-9a-f-]{36}$/);

  // A fresh published story with the poll placeholder the editor's Poll button produces.
  const slug = `e2e-poll-story-${stamp}`;
  const db = admin();
  const { error } = await db.from("articles").insert({
    site_id: SITE,
    section_id: NEWS,
    slug,
    title: `E2E poll story ${stamp}`,
    status: "published",
    published_at: new Date(Date.now() - 60_000).toISOString(),
    body_html: `<p>Before the poll.</p><div data-poll="${pollId}" class="poll-embed">Poll</div><p>After the poll.</p>`,
  });
  expect(error).toBeNull();

  await page.goto(`/news/${slug}`);
  const poll = page.getByTestId("poll");
  await expect(poll.getByRole("heading", { name: question })).toBeVisible();
  await poll.getByLabel("Yes").check();
  await poll.getByRole("button", { name: "Vote" }).click();
  await expect(poll.getByRole("status")).toContainText("Thanks for voting");
  await expect(poll.getByRole("list", { name: "Results" })).toContainText("100%");
  await expect(poll.getByText("1 vote", { exact: true })).toBeVisible();

  // Same browser, fresh page: no vote button, results and "Your vote" instead.
  await page.reload();
  await expect(page.getByTestId("poll").getByText("Your vote")).toBeVisible();
  await expect(page.getByTestId("poll").getByRole("button", { name: "Vote" })).toHaveCount(0);

  // And the server refuses a replay from the same browser.
  const { count } = await db.from("poll_votes").select("id", { count: "exact", head: true }).eq("poll_id", pollId);
  expect(count).toBe(1);

  // Another browser is another reader.
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await otherPage.goto(`/news/${slug}`);
  await otherPage.getByTestId("poll").getByLabel("No").check();
  await otherPage.getByTestId("poll").getByRole("button", { name: "Vote" }).click();
  await expect(otherPage.getByTestId("poll").getByText("2 votes", { exact: true })).toBeVisible();
  await other.close();
});

// Definition of done, part 2: enter a contest, then an editor draws a winner and the draw is recorded.
test("a reader enters a contest and an editor draws and records a winner", async ({ page, browser }) => {
  test.skip(process.env.E2E_FULL !== "1", "Needs a seeded local Supabase, Turnstile test keys and an editor session.");
  test.setTimeout(120_000);
  const stamp = Date.now().toString(36);
  const db = admin();
  const { data: contest, error } = await db
    .from("contests")
    .insert({
      site_id: SITE,
      slug: `e2e-contest-${stamp}`,
      title: `E2E contest ${stamp}`,
      prize: "A signed book",
      rules: "One entry per person. The winner is drawn at random after closing and told by email.",
      status: "open",
      closes_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    })
    .select("id, slug")
    .single();
  expect(error).toBeNull();

  await page.goto(`/contests/${contest!.slug}`);
  await page.getByLabel("Your name").fill("Rae Reader");
  await page.getByLabel("Email").fill(`rae-${stamp}@example.com`);
  await page.getByRole("checkbox").check();
  await page.waitForFunction(() => Boolean((document.querySelector('input[name="cf-turnstile-response"]') as HTMLInputElement | null)?.value));
  await page.getByRole("button", { name: "Enter the contest" }).click();
  await expect(page.getByRole("status")).toContainText("You’re entered");

  // Entries stay private.
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "", {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: leaked } = await anon.from("contest_entries").select("email");
  expect(leaked ?? []).toEqual([]);

  await db.from("contests").update({ status: "closed" }).eq("id", contest!.id);
  const editor = await signIn(browser, "editor");
  await editor.page.goto(`/admin/contests/${contest!.id}`);
  await expect(editor.page.getByText("1 entries")).toBeVisible();
  await editor.page.getByRole("button", { name: "Draw a winner" }).click();
  await expect(editor.page.getByRole("status")).toContainText("Winner drawn and recorded");
  await expect(editor.page.getByTestId("draw-history")).toContainText("Rae Reader");
  const { data: draws } = await db.from("contest_draws").select("seed, entry_count").eq("contest_id", contest!.id);
  expect(draws).toHaveLength(1);
  expect(draws![0].seed).toMatch(/^[0-9a-f]{64}$/);
  expect(draws![0].entry_count).toBe(1);

  await page.goto(`/contests/${contest!.slug}`);
  await expect(page.getByTestId("contest-winner")).toContainText("Rae");
});
