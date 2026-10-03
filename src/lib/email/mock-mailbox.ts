import "server-only";

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type MockMessage = { to: string; subject: string; text: string; html?: string; at: string };

// Selected only by EMAIL_PROVIDER=mock. Unset (the production default) keeps Resend.
export function isMockMail(env: Record<string, string | undefined> = process.env): boolean {
  return env.EMAIL_PROVIDER === "mock";
}

// Appends one JSON line the Playwright process can read. A missing path is a no-op
// with a warning, the same way a missing Resend key refuses to send.
export function appendMockMail(message: Omit<MockMessage, "at">, env: Record<string, string | undefined> = process.env): boolean {
  const path = env.E2E_MAILBOX_PATH?.trim();
  if (!path) {
    console.warn("email not sent: EMAIL_PROVIDER=mock but E2E_MAILBOX_PATH is not set");
    return false;
  }
  const line: MockMessage = { ...message, at: new Date().toISOString() };
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(line)}\n`);
  return true;
}
