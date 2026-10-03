import assert from "node:assert/strict";
import { test } from "node:test";

import { sendMail } from "./resend";

test("missing Resend config returns a warning instead of throwing", async () => {
  const saved = { key: process.env.RESEND_API_KEY, from: process.env.RESEND_FROM, provider: process.env.EMAIL_PROVIDER };
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_FROM;
  delete process.env.EMAIL_PROVIDER;
  try {
    const outcome = await sendMail({ to: ["someone@example.test"], subject: "s", text: "t" });
    assert.equal(outcome.ok, false);
    assert.ok(!outcome.ok && outcome.warning.length > 0);
  } finally {
    if (saved.key) process.env.RESEND_API_KEY = saved.key;
    if (saved.from) process.env.RESEND_FROM = saved.from;
    if (saved.provider) process.env.EMAIL_PROVIDER = saved.provider;
  }
});
