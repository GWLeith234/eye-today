import type { EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";

import { safeNextPath } from "@/lib/auth/access";
import { originFromHeaders } from "@/lib/auth/origin";
import { createClient } from "@/lib/supabase/server";

const OTP_TYPES: EmailOtpType[] = ["magiclink", "email", "invite", "signup", "recovery", "email_change"];

// Handles PKCE links (?code=) from magic link and Google, and token-hash links
// (?token_hash=&type=) for invite emails.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const origin = originFromHeaders(request.headers);
  const next = safeNextPath(params.get("next"));

  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;

  const supabase = await createClient();
  let ok = false;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  } else if (tokenHash && type && OTP_TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    ok = !error;
  }

  const target = ok ? next : "/login?error=auth";
  return NextResponse.redirect(new URL(target, origin));
}
