import { readFileSync } from "node:fs";
import { join } from "node:path";

import { e2eEnv } from "./guard";

export type Mail = { at: string; to: string; subject: string; text: string; html?: string; headers?: Record<string, string> };

// What the app's mock mail provider wrote (EMAIL_PROVIDER=mock). One JSON line per message.
export function readMailbox(): Mail[] {
  try {
    return readFileSync(join(e2eEnv().mailboxDir, "mailbox.jsonl"), "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Mail);
  } catch {
    return [];
  }
}

// Mail is sent after the response (newsletter) or after the database write, so poll for it.
export async function waitForMail(match: (mail: Mail) => boolean, timeoutMs = 20_000): Promise<Mail> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = readMailbox().find(match);
    if (found) return found;
    if (Date.now() > deadline) throw new Error(`no matching email arrived within ${timeoutMs} ms (mailbox holds ${readMailbox().length})`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

export function linkIn(mail: Mail, pattern: RegExp): string {
  const found = pattern.exec(mail.text)?.[0];
  if (!found) throw new Error(`no link matching ${pattern} in "${mail.subject}"`);
  return found;
}
