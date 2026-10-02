import { z } from "zod";

import { newConfirmToken } from "./tokens";
import { confirmUrl } from "./urls";

// No server-only import: the tests load this file with fake dependencies.

export const CHECK_EMAIL = "Check your email to confirm.";
export const NOT_CONFIGURED_MESSAGE = "Email is not configured.";

export const NEWSLETTER_LISTS = [
  { slug: "daily", name: "Daily Brief" },
  { slug: "weekly", name: "Weekly Roundup" },
] as const;

export type SignupState = { ok: boolean; message: string };

export type SignupDeps = {
  configured: boolean;
  siteUrl: string;
  ipHash: string;
  // The anon RPC request_newsletter_subscribe. null means the call itself failed.
  requestSubscribe: (args: { email: string; list_slug: string; ip_hash: string; confirm_token_hash: string }) => Promise<boolean | null>;
  sendConfirm: (args: { to: string; listName: string; confirmUrl: string }) => Promise<unknown>;
  // Runs work after the response has gone, so a mail being sent does not change how long the reply takes.
  defer: (work: () => Promise<void>) => void;
};

const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());

// The reply says the same thing whether the address is new, already subscribed, bounced or
// rate limited. The confirm mail goes out only when the RPC said so.
export async function processSignup(input: { email: string; lists: string[] }, deps: SignupDeps): Promise<SignupState> {
  if (!deps.configured) return { ok: false, message: NOT_CONFIGURED_MESSAGE };

  const email = emailSchema.safeParse(input.email);
  if (!email.success) return { ok: false, message: "Enter a valid email address." };
  const chosen = NEWSLETTER_LISTS.filter((l) => input.lists.includes(l.slug));
  if (chosen.length === 0) return { ok: false, message: "Choose at least one newsletter." };

  for (const list of chosen) {
    const token = newConfirmToken();
    const shouldSend = await deps.requestSubscribe({
      email: email.data,
      list_slug: list.slug,
      ip_hash: deps.ipHash,
      confirm_token_hash: token.hash,
    });
    if (shouldSend === true) {
      deps.defer(async () => {
        await deps.sendConfirm({ to: email.data, listName: list.name, confirmUrl: confirmUrl(deps.siteUrl, token.raw) });
      });
    }
  }
  return { ok: true, message: CHECK_EMAIL };
}
