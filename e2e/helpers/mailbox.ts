import { readFileSync } from "node:fs";

export type MailLine = { to: string; subject: string; text: string; html?: string };

export async function waitForMail(to: string, includes: string): Promise<MailLine> {
  const path = process.env.E2E_MAILBOX_PATH;
  if (!path) throw new Error("E2E_MAILBOX_PATH is not set");
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const lines = readFileSync(path, "utf8").split("\n").filter(Boolean);
      for (const line of lines) {
        const message = JSON.parse(line) as MailLine;
        const body = `${message.text}\n${message.html ?? ""}`;
        if (message.to === to && body.includes(includes)) return message;
      }
    } catch {
      // The file appears when the first message is written.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`No message for ${to} containing ${includes}`);
}

export type StripeLine = { customer: string; price: string; mode: string };

export async function waitForStripeSession(): Promise<StripeLine> {
  const path = process.env.E2E_STRIPE_LOG;
  if (!path) throw new Error("E2E_STRIPE_LOG is not set");
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const lines = readFileSync(path, "utf8").split("\n").filter(Boolean);
      if (lines.length > 0) return JSON.parse(lines[lines.length - 1]) as StripeLine;
    } catch {
      // Written when checkout creates the session.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("No checkout session was recorded");
}
