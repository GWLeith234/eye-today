import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { mailConfig, sendIssueEmail } from "@/lib/newsletter/provider";

import { sendMail } from "./resend";
import { isMockMail, mockMailDir, recordMockMail } from "./mock";

async function withEnv(values: Record<string, string | undefined>, work: () => Promise<void> | void) {
  const keys = Object.keys(values);
  const before = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  for (const key of keys) {
    if (values[key] === undefined) delete process.env[key];
    else process.env[key] = values[key];
  }
  try {
    await work();
  } finally {
    for (const key of keys) {
      if (before[key] === undefined) delete process.env[key];
      else process.env[key] = before[key];
    }
  }
}

const NO_MAIL_ENV = { EMAIL_PROVIDER: undefined, E2E_MAILBOX_DIR: undefined, RESEND_API_KEY: undefined, RESEND_FROM: undefined };
const NEWSLETTER_ENV = { NEWSLETTER_POSTAL_ADDRESS: "1 Test St", NEWSLETTER_LINK_SECRET: "secret", SITE_URL: "http://127.0.0.1:3000" };

test("the mock mailbox is off unless EMAIL_PROVIDER=mock and a directory are both set", () => {
  assert.equal(mockMailDir({}), null);
  assert.equal(mockMailDir({ EMAIL_PROVIDER: "mock" }), null);
  assert.equal(mockMailDir({ E2E_MAILBOX_DIR: "/tmp/x" }), null);
  assert.equal(mockMailDir({ EMAIL_PROVIDER: "resend", E2E_MAILBOX_DIR: "/tmp/x" }), null);
  assert.equal(mockMailDir({ EMAIL_PROVIDER: "mock", E2E_MAILBOX_DIR: "/tmp/x" }), "/tmp/x");
  assert.equal(isMockMail({}), false);
  assert.equal(recordMockMail({ to: "a@b.test", subject: "s", text: "t" }, { EMAIL_PROVIDER: "mock" }), false);
});

test("without the switch, mail still needs Resend and nothing is written", async () => {
  const dir = mkdtempSync(join(tmpdir(), "mock-mail-"));
  try {
    await withEnv({ ...NO_MAIL_ENV, E2E_MAILBOX_DIR: dir }, async () => {
      const outcome = await sendMail({ to: ["a@b.test"], subject: "Hi", text: "Body" });
      assert.deepEqual(outcome, { ok: false, warning: "Saved, but email notifications are not configured." });
      assert.equal(mailConfig(), null);
      assert.throws(() => readFileSync(join(dir, "mailbox.jsonl")));
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("with the switch, notifications are written to the mailbox, one line per distinct recipient", async () => {
  const dir = mkdtempSync(join(tmpdir(), "mock-mail-"));
  try {
    await withEnv({ ...NO_MAIL_ENV, EMAIL_PROVIDER: "mock", E2E_MAILBOX_DIR: dir }, async () => {
      const outcome = await sendMail({ to: ["A@B.test", "a@b.test", "c@d.test"], subject: "Line\r\nbreak", text: "Body" });
      assert.deepEqual(outcome, { ok: true });
      const lines = readFileSync(join(dir, "mailbox.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
      assert.deepEqual(lines.map((l) => l.to), ["a@b.test", "c@d.test"]);
      assert.equal(lines[0].subject, "Line break");
      assert.equal(lines[0].text, "Body");
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("with the switch, newsletter mail needs no Resend key but still needs its own settings", async () => {
  const dir = mkdtempSync(join(tmpdir(), "mock-mail-"));
  try {
    await withEnv({ ...NO_MAIL_ENV, EMAIL_PROVIDER: "mock", E2E_MAILBOX_DIR: dir, ...NEWSLETTER_ENV }, async () => {
      assert.notEqual(mailConfig(), null);
      const outcome = await sendIssueEmail({
        to: "r@e.test",
        subject: "Issue",
        html: "<p>Hi</p>",
        text: "Hi http://127.0.0.1:3000/newsletter/unsubscribe?t=abc",
        unsubscribeUrl: "http://127.0.0.1:3000/newsletter/unsubscribe?t=abc",
        issueId: "i1",
        subscriberId: "s1",
      });
      assert.equal(outcome.ok && outcome.providerId?.startsWith("mock-"), true);
      const [line] = readFileSync(join(dir, "mailbox.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
      assert.equal(line.to, "r@e.test");
      assert.equal(line.subject, "Issue");
      assert.equal(line.headers["List-Unsubscribe"], "<http://127.0.0.1:3000/newsletter/unsubscribe?t=abc>");
      assert.equal(line.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
    });
    await withEnv({ ...NO_MAIL_ENV, EMAIL_PROVIDER: "mock", E2E_MAILBOX_DIR: dir, ...NEWSLETTER_ENV, NEWSLETTER_LINK_SECRET: undefined }, () => {
      assert.equal(mailConfig(), null);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
