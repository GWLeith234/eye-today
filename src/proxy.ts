import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { type AppRole, areaFor, loginPath, redirectFor } from "@/lib/auth/access";
import { sessionCookieOptions } from "@/lib/auth/cookie-options";
import { applySecurityHeaders } from "@/lib/http/security-headers";
import { isReservedSectionSlug } from "@/lib/public/reserved";
import { SLUG_RE } from "@/lib/slug";
import { getPublicSupabaseEnv } from "@/lib/supabase/env";

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // next.config redirects() do not receive headers(). Railway forwards whatever
  // Next sends, so this redirect is issued here and carries the security set.
  if (pathname === "/newsletters") {
    const redirect = NextResponse.redirect(new URL(`/newsletter${search}`, request.url), 307);
    applySecurityHeaders(redirect.headers);
    return redirect;
  }

  let response = NextResponse.next({ request });
  const env = getPublicSupabaseEnv();
  if (!env) return response;

  const supabase = createServerClient(env.url, env.anonKey, {
    cookieOptions: sessionCookieOptions(),
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    },
  });

  // Validates the session with Supabase Auth and refreshes cookies if needed.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let target: string | null = null;
  let status = 307;

  const area = areaFor(pathname);
  if (area) {
    let role: AppRole | null = null;
    if (user) {
      const { data } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle<{ role: AppRole }>();
      role = data?.role ?? null;
    }
    const to = redirectFor(area, Boolean(user), role);
    if (to) target = to === "/login" ? loginPath(`${pathname}${search}`) : to;
  } else if (pathname === "/login" && user) {
    target = "/account";
  }

  // An article address it used to have: /<old section>/<old slug> -> its current path.
  // The function answers null for current slugs, unknown paths and articles that
  // are not live, so a normal article view costs one indexed lookup.
  if (!target) {
    const match = /^\/([^/]+)\/([^/]+)\/?$/.exec(pathname);
    if (match && !isReservedSectionSlug(match[1]) && SLUG_RE.test(match[1]) && SLUG_RE.test(match[2])) {
      const { data } = await supabase.rpc("article_slug_redirect", { section: match[1], slug: match[2] });
      if (typeof data === "string" && data.startsWith("/") && data !== pathname) {
        target = `${data}${search}`;
        status = 308;
      }
    }
  }

  if (!target) return response;

  // Carry any refreshed session cookies and no-store headers onto the redirect.
  const redirect = NextResponse.redirect(new URL(target, request.url), status);
  for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
  for (const key of ["cache-control", "expires", "pragma"]) {
    const value = response.headers.get(key);
    if (value) redirect.headers.set(key, value);
  }
  // next.config headers cover rendered pages. Redirects returned from the proxy
  // need the same set, and only when the response does not already have them.
  applySecurityHeaders(redirect.headers);
  return redirect;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|api/health|api/cron|api/webhooks|api/ads|api/view|.*\\..*).*)"],
};
