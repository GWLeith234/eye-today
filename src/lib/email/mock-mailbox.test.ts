import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { appendMockMail, isMockMail } from "./mock-mailbox";

test("mock mail is off unless EMAIL_PROVIDER=mock", () => {
  assert.equal(isMockMail({}), false);
  assert.equal(isMockMail({ EMAIL_PROVIDER: "resend" }), false);
  assert.equal(isMockMail({ EMAIL_PROVIDER: "mock" }), true);
});

test("mock mail appends a JSON line and refuses when the path is unset", () => {
  assert.equal(appendMockMail({ to: "a@example.com", subject: "s", text: "t" }, {}), false);

  const dir = mkdtempSync(join(tmpdir(), "eye-mailbox-"));
  const path = join(dir, "box.jsonl");
  assert.equal(appendMockMail({ to: "a@example.com", subject: "Confirm", text: "https://example/newsletter/confirm?t=abc", html: "<p>hi</p>" }, { E2E_MAILBOX_PATH: path }), true);
  const row = JSON.parse(readFileSync(path, "utf8").trim()) as { to: string; subject: string; text: string };
  assert.equal(row.to, "a@example.com");
  assert.equal(row.subject, "Confirm");
  assert.match(row.text, /newsletter\/confirm/);
});
