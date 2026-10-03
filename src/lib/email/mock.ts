import "server-only";

import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// Test double for outgoing mail. Selected by EMAIL_PROVIDER=mock and only honoured when
// E2E_MAILBOX_DIR names a directory, so a stray EMAIL_PROVIDER alone never swallows real mail.
// Each message is one JSON line in <dir>/mailbox.jsonl, which the end-to-end tests read.

type Env = Record<string, string | undefined>;

export type MockMail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  headers?: Record<string, string>;
};

export function mockMailDir(env: Env = process.env): string | null {
  if (env.EMAIL_PROVIDER?.trim() !== "mock") return null;
  return env.E2E_MAILBOX_DIR?.trim() || null;
}

export const isMockMail = (env: Env = process.env) => mockMailDir(env) !== null;

export function recordMockMail(mail: MockMail, env: Env = process.env): boolean {
  const dir = mockMailDir(env);
  if (!dir) return false;
  mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, "mailbox.jsonl"), `${JSON.stringify({ at: new Date().toISOString(), ...mail })}\n`);
  return true;
}
