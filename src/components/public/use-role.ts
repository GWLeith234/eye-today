"use client";

import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/browser";

// The signed-in user's own profile role, read in the browser so public pages carry no cookies and
// stay cacheable. One shared request; null while loading and for signed-out visitors. Only
// cosmetic things use it (badge, hiding placeholders, the support note): access is never decided here.
let pending: Promise<string | null> | null = null;

function load(): Promise<string | null> {
  pending ??= (async () => {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return null;
    const { data } = await supabase.from("profiles").select("role").eq("id", session.user.id).maybeSingle<{ role: string }>();
    return data?.role ?? null;
  })().catch(() => null);
  return pending;
}

export function useRole(): string | null {
  const [role, setRole] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    load().then((value) => alive && setRole(value));
    const { data } = createClient().auth.onAuthStateChange((event) => {
      if (event === "INITIAL_SESSION") return;
      pending = null;
      load().then((value) => alive && setRole(value));
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);
  return role;
}
