"use server";

import { headers } from "next/headers";
import { after } from "next/server";

import { isMailConfigured, sendConfirmEmail } from "@/lib/newsletter/provider";
import { NEWSLETTER_LISTS, processSignup, type SignupState } from "@/lib/newsletter/signup";
import { hashIp } from "@/lib/newsletter/tokens";
import { createAnonClient } from "@/lib/supabase/anon";

const REPLY = "Check your email to confirm.";

// Public signup. Uses the cookie-less anon client and the request_newsletter_subscribe RPC only.
// The reply is the same whether the address is new, already subscribed, bounced or rate limited.
export async function subscribeToNewsletter(_previous: SignupState | null, formData: FormData): Promise<SignupState> {
  // A hidden field real readers never fill in.
  if (String(formData.get("website") ?? "").trim()) return { ok: true, message: REPLY };

  const requestHeaders = await headers();
  const supabase = createAnonClient();
  const ipHash = hashIp(requestHeaders.get("x-forwarded-for"), process.env.VIEW_HASH_SALT);

  return processSignup(
    {
      email: String(formData.get("email") ?? ""),
      lists: formData.getAll("lists").map(String).filter((slug) => NEWSLETTER_LISTS.some((l) => l.slug === slug)),
    },
    {
      configured: isMailConfigured() && supabase !== null,
      siteUrl: process.env.SITE_URL?.trim() ?? "",
      ipHash,
      requestSubscribe: async (args) => {
        if (!supabase) return null;
        const { data, error } = await supabase.rpc("request_newsletter_subscribe", {
          email: args.email,
          list_slug: args.list_slug,
          ip_hash: args.ip_hash,
          confirm_token_hash: args.confirm_token_hash,
        });
        if (error) {
          console.error("newsletter signup failed", { code: error.code });
          return null;
        }
        return data === true;
      },
      sendConfirm: (args) => sendConfirmEmail(args),
      defer: (work) => after(work),
    },
  );
}
