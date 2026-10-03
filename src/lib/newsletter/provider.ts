import "server-only";

import { randomUUID } from "node:crypto";

import { Resend } from "resend";

import { isMockMail, recordMockMail } from "@/lib/email/mock";

import { renderConfirm } from "./render";

export const NOT_CONFIGURED = "Email is not configured.";
const SEND_FAILED = "The email could not be sent.";

type MailConfig = { apiKey: string; from: string; postalAddress: string; linkSecret: string; siteUrl: string };

// Everything an issue needs: the sender, the postal address for the footer, the secret the
// unsubscribe links derive from, and the absolute site URL the links point at.
export function mailConfig(): MailConfig | null {
  // EMAIL_PROVIDER=mock (tests only) stands in for the Resend key and sender; the rest is still required.
  const mock = isMockMail();
  const apiKey = mock ? "mock" : process.env.RESEND_API_KEY?.trim();
  const from = mock ? "Eye Today <mock@eyetoday.invalid>" : process.env.RESEND_FROM?.trim();
  const postalAddress = process.env.NEWSLETTER_POSTAL_ADDRESS?.trim();
  const linkSecret = process.env.NEWSLETTER_LINK_SECRET?.trim();
  const siteUrl = process.env.SITE_URL?.trim();
  if (!apiKey || !from || !postalAddress || !linkSecret || !siteUrl) return null;
  return { apiKey, from, postalAddress, linkSecret, siteUrl };
}

export const isMailConfigured = () => mailConfig() !== null;

export type SendOutcome = { ok: true; providerId: string | null } | { ok: false; error: string };

const oneLine = (value: string) => value.replace(/[\r\n]+/g, " ").trim().slice(0, 200);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Payload = { to: string; subject: string; html: string; text: string; headers?: Record<string, string>; idempotencyKey?: string };

// One recipient per call. Checks { data, error }; logs the error name only, never the address or body.
async function send(cfg: MailConfig, payload: Payload): Promise<SendOutcome> {
  if (isMockMail()) {
    recordMockMail({ to: payload.to, subject: oneLine(payload.subject), text: payload.text, html: payload.html, headers: payload.headers });
    return { ok: true, providerId: `mock-${randomUUID()}` };
  }
  const resend = new Resend(cfg.apiKey);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { data, error } = await resend.emails.send(
        { from: cfg.from, to: payload.to, subject: oneLine(payload.subject), html: payload.html, text: payload.text, headers: payload.headers },
        payload.idempotencyKey ? { idempotencyKey: payload.idempotencyKey } : undefined,
      );
      if (error) {
        if (error.name === "rate_limit_exceeded" && attempt < 2) {
          await sleep(1000 * (attempt + 1));
          continue;
        }
        console.error(`newsletter email failed: ${error.name}`);
        return { ok: false, error: SEND_FAILED };
      }
      return { ok: true, providerId: data?.id ?? null };
    } catch (error) {
      console.error(`newsletter email failed: ${error instanceof Error ? error.name : "unknown"}`);
      return { ok: false, error: SEND_FAILED };
    }
  }
  return { ok: false, error: SEND_FAILED };
}

export async function sendConfirmEmail({ to, listName, confirmUrl }: { to: string; listName: string; confirmUrl: string }): Promise<SendOutcome> {
  const cfg = mailConfig();
  if (!cfg) return { ok: false, error: NOT_CONFIGURED };
  const { html, text } = await renderConfirm({ listName, confirmUrl, postalAddress: cfg.postalAddress });
  return send(cfg, { to, subject: `Confirm your Eye Today ${listName} subscription`, html, text });
}

// An issue to one subscriber. The idempotency key makes a retry of the same issue and
// subscriber a no-op at Resend. Test sends pass no ids and no key.
export async function sendIssueEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
  unsubscribeUrl: string;
  issueId?: string;
  subscriberId?: string;
}): Promise<SendOutcome> {
  const cfg = mailConfig();
  if (!cfg) return { ok: false, error: NOT_CONFIGURED };
  const key = input.issueId && input.subscriberId ? `newsletter/${input.issueId}/${input.subscriberId}` : undefined;
  if (key && key.length > 256) return { ok: false, error: SEND_FAILED };
  return send(cfg, {
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
    idempotencyKey: key,
    headers: {
      "List-Unsubscribe": `<${input.unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });
}
