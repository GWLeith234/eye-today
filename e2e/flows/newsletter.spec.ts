import { expect, test } from "@playwright/test";

import { queryRows } from "../helpers/db";
import { e2eEnv, e2eFull } from "../helpers/guard";
import { linkIn, waitForMail } from "../helpers/mailbox";
import { uniqueId } from "../helpers/users";

// Without E2E_FULL the placeholder job leaves email unconfigured, so signup cannot send.
test("newsletter signup does not send mail when email is not configured", async ({ page }) => {
  test.skip(e2eFull(), "Email is mocked, and therefore configured, in the e2e-full job.");
  await page.goto("/newsletter");
  await page.locator("main").getByLabel("Daily Brief").check();
  await page.locator("main").getByLabel("Email address").fill("reader@example.com");
  await page.locator("main").getByRole("button", { name: "Subscribe" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("Email is not configured.");
});

test.describe("double opt-in through the mock mailbox", () => {
  test.skip(!e2eFull(), "Needs E2E_FULL=1 on a seeded local Supabase (the e2e-full CI job).");

  test("subscribe, confirm from the email, receive an issue, unsubscribe in one click", async ({ page, request }) => {
    test.setTimeout(120_000);
    const run = uniqueId();
    const email = `e2e-reader-${run}@e2e.eyetoday.test`;
    const subject = `E2E issue ${run}`;
    const subscriber = async () =>
      (
        await queryRows<{ status: string }>(
          `select s.status from public.newsletter_subscribers s join public.newsletter_lists l on l.id = s.list_id where s.email = $1 and l.slug = 'daily'`,
          [email],
        )
      )[0]?.status;

    await test.step("signing up sends a confirmation email and leaves the row pending", async () => {
      await page.goto("/newsletter");
      await page.locator("main").getByLabel("Daily Brief").check();
      await page.locator("main").getByLabel("Email address").fill(email);
      await page.locator("main").getByRole("button", { name: "Subscribe" }).click();
      await expect(page.locator("main").getByRole("status")).toContainText("Check your email to confirm.");
      await expect.poll(subscriber).toBe("pending");
    });

    await test.step("opening the link does not confirm; pressing the button does", async () => {
      const mail = await waitForMail((m) => m.to === email && m.subject === "Confirm your Eye Today Daily Brief subscription");
      const link = linkIn(mail, /https?:\/\/[^\s"<>]+\/newsletter\/confirm\?t=[A-Za-z0-9_-]+/);

      await page.goto(link);
      await expect(page.getByRole("button", { name: "Confirm my subscription" })).toBeVisible();
      expect(await subscriber()).toBe("pending");

      await page.getByRole("button", { name: "Confirm my subscription" }).click();
      await expect(page.getByRole("heading", { name: "You're subscribed" })).toBeVisible();
      expect(await subscriber()).toBe("active");
    });

    await test.step("an issue sent by the cron reaches the subscriber with one-click unsubscribe headers", async () => {
      const [story] = await queryRows<{ id: string }>("select id from public.articles where slug = 'welcome-to-eye-today' and status = 'published'");
      expect(story, "the seed's published story").toBeTruthy();
      const [issue] = await queryRows<{ id: string }>(
        `insert into public.newsletter_issues (site_id, list_id, subject, intro, story_ids, status, scheduled_for)
         select l.site_id, l.id, $1, 'E2E intro.', array[$2::uuid], 'scheduled', now() - interval '1 minute'
           from public.newsletter_lists l where l.slug = 'daily'
         returning id`,
        [subject, story!.id],
      );

      const response = await request.post("/api/cron/newsletters", { headers: { authorization: `Bearer ${e2eEnv().cronSecret}` } });
      expect(response.status()).toBe(200);
      const { issues } = (await response.json()) as { issues: { id: string; ok: boolean; sent?: number }[] };
      const report = issues.find((i) => i.id === issue!.id);
      expect(report?.ok).toBe(true);
      expect(report?.sent).toBeGreaterThanOrEqual(1);
    });

    await test.step("the one-click POST unsubscribes, and the page reflects it", async () => {
      const mail = await waitForMail((m) => m.to === email && m.subject === subject);
      const link = linkIn(mail, /https?:\/\/[^\s"<>]+\/newsletter\/unsubscribe\?t=[A-Za-z0-9_-]+/);
      expect(mail.headers?.["List-Unsubscribe"]).toBe(`<${link}>`);
      expect(mail.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");

      // A GET (a mail scanner opening the link) must not change anything.
      await page.goto(link);
      await expect(page.getByRole("button", { name: "Unsubscribe" })).toBeVisible();
      expect(await subscriber()).toBe("active");

      const post = await request.post(link);
      expect(post.status()).toBe(200);
      expect(await subscriber()).toBe("unsubscribed");

      await page.goto(link);
      await expect(page.getByText("is not subscribed to the Daily Brief")).toBeVisible();
    });
  });
});
