"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/browser";

import { useRole } from "./use-role";

// Decided in the browser so public pages carry no cookies and can be cached.
// getSession() reads local storage only; the account pages still verify the user.
export function AccountLink() {
  const [signedIn, setSignedIn] = useState(false);
  const role = useRole();
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)), () => {});
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setSignedIn(Boolean(session)));
    return () => data.subscription.unsubscribe();
  }, []);
  return (
    <span className="inline-flex items-center gap-2">
      <Link href={signedIn ? "/account" : "/login"} className="rounded border border-ink px-2 py-0.5 hover:bg-ink hover:text-paper">
        {signedIn ? "Account" : "Sign in"}
      </Link>
      {signedIn && role === "supporter" ? (
        <span className="rounded bg-accent px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-ink">Supporter</span>
      ) : null}
    </span>
  );
}
