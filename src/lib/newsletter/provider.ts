import "server-only";

import { Resend } from "resend";

import { appendMockMail, isMockMail } from "@/lib/email/mock-mailbox";

import { renderConfirm } from "./render";

export const NOT_CONFIGURED = "Email is not configured.";
const SEND_FAILED = "The email could not be sent.";

type MailConfig = { apiKey: string; from: string; postalAddress: string; linkSecret: string; siteUrl: string; mock: boolean };

// Everything an issue needs: the sender, the postal address for the footer, the secret the
// unsubscribe links derive from, and the absolute site URL the links point at.
// EMAIL_PROVIDER=mock writes the message to a file instead of calling Resend, so the
// confirm link can be read without a network call. Resend stays the default.
export function mailConfig(): MailConfig | null {
  const mock = isMockMail();
  const apiKey = mock ? "mock" : process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM?.trim() || (mock ? "Eye Today <newsroom@example.com>" : "");
  const postalAddress = process.env.NEWSLETTER_POSTAL_ADDRESS?.trim();
  const linkSecret = process.env.NEWSLETTER_LINK_SECRET?.trim();
  const siteUrl = process.env.SITE_URL?.trim();
  if (!apiKey || !from || !postalAddress || !linkSecret || !siteUrl) return null;
  return { apiKey, from, postalAddress, linkSecret, siteUrl, mock };
}

export const isMailConfigured = () => mailConfig() !== null;

export type SendOutcome = { ok: true; providerId: string | null } | { ok: false; error: string };

const oneLine = (value: string) => value.replace(/[\r\n]+/g, " ").trim().slice(0, 200);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Payload = { to: string; subject: string; html: string; text: string; headers?: Record<string, string>; idempotencyKey?: string };

// One recipient per call. Checks { data, error }; logs the error name only, never the address or body.
async function send(cfg: MailConfig, payload: Payload): Promise<SendOutcome> {
  if (cfg.mock) {
    const wrote = appendMockMail({ to: payload.to, subject: oneLine(payload.subject), text: payload.text, html: payload.html });
    return wrote ? { ok: true, providerId: "mock" } : { ok: false, error: NOT_CONFIGURED };
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
