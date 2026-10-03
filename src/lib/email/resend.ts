import "server-only";

import { Resend } from "resend";

import { isMockMail, recordMockMail } from "./mock";

export type MailOutcome = { ok: true } | { ok: false; warning: string };

// Sends one plain-text email per recipient (so addresses are never shared).
// Callers send only after their database write has succeeded; a mail failure
// never undoes that write, it becomes a warning in the action result.
export async function sendMail({ to, subject, text }: { to: string[]; subject: string; text: string }): Promise<MailOutcome> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  const mock = isMockMail();
  if (!mock && (!key || !from)) {
    console.warn("email not sent: RESEND_API_KEY or RESEND_FROM is not set");
    return { ok: false, warning: "Saved, but email notifications are not configured." };
  }

  const recipients = [...new Set(to.map((address) => address.trim().toLowerCase()).filter(Boolean))];
  if (recipients.length === 0) return { ok: false, warning: "Saved, but there was nobody to email." };

  // Titles are user-written; keep them from adding header lines.
  const cleanSubject = subject.replace(/[\r\n]+/g, " ").trim().slice(0, 200);

  if (mock) {
    for (const recipient of recipients) recordMockMail({ to: recipient, subject: cleanSubject, text });
    return { ok: true };
  }

  if (!key || !from) return { ok: false, warning: "Saved, but email notifications are not configured." };
  const resend = new Resend(key);
  let failures = 0;
  for (const recipient of recipients) {
    try {
      const { error } = await resend.emails.send({ from, to: recipient, subject: cleanSubject, text });
      if (error) {
        failures++;
        console.error("email failed", { name: error.name, message: error.message });
      }
    } catch (error) {
      failures++;
      console.error("email failed", { message: error instanceof Error ? error.message : "unknown error" });
    }
  }
  return failures === 0 ? { ok: true } : { ok: false, warning: "Saved, but some notification emails could not be sent." };
}
