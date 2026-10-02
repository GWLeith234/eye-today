# Sprint 10 — Launch hardening & QA

**Definition of done:** The Playwright suite is green in CI. The read-only smoke subset is green against the production URL. The Supabase security advisor shows zero ERROR-level findings. Every legal page above returns 200, and an unknown URL returns the custom 404.

Branch: `sprint-10-launch`, from `main` (`8e932ef`).

No new reader features, no schema redesign, no rebrand. No migration unless a table is actually required. This sprint does not add one.

## Pre-flight (GO WITH CHANGES)

`docs/sprints/sprint-10-launch.md` did not exist on `main`. The spec is the sprint request. Placeholder pages, `StaticPage`, `src/content/ad-policy.md`, rate limits, `/api/health` and CI were present and named as described.

| # | Severity | Area | Issue | Fix applied |
| --- | --- | --- | --- | --- |
| 1 | high | docs | Sprint doc was not in the repo. | This file. |
| 2 | high | markdown | No markdown library. `StaticPage` is a title shell. `sanitizeArticleHtml` allows embeds. | Small renderer plus a fresh DOMPurify allowlist (no iframes). |
| 3 | high | 404 | Unknown URLs hit the root `not-found`, which is outside the `(public)` layout. | Root 404 includes header, footer, search and latest stories. `(public)/not-found` does not repeat the chrome. |
| 4 | high | CSP | Next injects inline scripts. An enforced nonce policy cannot live in static `headers()`. | `Content-Security-Policy-Report-Only` with `'unsafe-inline'` for scripts and styles. No `'unsafe-eval'`. |
| 5 | high | e2e | Full editorial and Stripe flows need seeded users. `supabase start` is not what CI can rely on. | CI runs smoke, axe and no-side-effect flows against a production build and placeholder Supabase. Full flows are `test.skip` unless `E2E_FULL=1`. |
| 6 | high | Sentry | The browser cannot see `SENTRY_DSN`. | Client uses `NEXT_PUBLIC_SENTRY_DSN`. Server uses `SENTRY_DSN`. Source maps upload only when the auth token, org and project are all set. |
| 7 | medium | routes | The newsletter page is `/newsletter`, not `/newsletters`. | Axe and links use `/newsletter`. `/newsletters` redirects. `disclaimer` and `ad-policy` are reserved slugs and are in the sitemap. |
| 8 | medium | limits | `/api/view` always returned 204 and `startCheckout` had no cap. | In-memory limits: 30 views/minute/IP (still 204) and 8 checkouts/10 minutes/user. |
| 9 | medium | framing | Preview links are `target=_blank`, not framed. | `X-Frame-Options: DENY` everywhere, including `/preview`. |
| 10 | low | copy | Draft status must not render as a banner. TODO paragraphs for clinic ownership and crisis resources must stay visible. | Front matter is stripped. Blockquotes remain. |

### Origins the CSP has to allow

Loaded by the browser today: Supabase (`https` and `wss` on `*.supabase.co`), Cloudflare Turnstile (`https://challenges.cloudflare.com`), YouTube (`www.youtube.com` and `www.youtube-nocookie.com`), X (`https://platform.twitter.com`), Instagram (`https://www.instagram.com`), YouTube poster images (`https://i.ytimg.com`). System fonts only. Resend, Anthropic and the Stripe server SDK are server-side. Checkout is a redirect, not a script on our origin. Plausible and Sentry are added by this sprint.

Enforcing this policy later still breaks if `'unsafe-inline'` is removed, and it breaks Turnstile, embeds, Supabase images, Plausible or Sentry if those hosts are dropped.

### Likely breaks, and what we did

- Build with no new env vars: Plausible and Sentry init only when their variables are set.
- Duplicate CSP headers: `next.config` sets them; the proxy adds them only on redirects and only when missing.
- Root 404 throwing: `getLatest` already returns `[]` on failure, and the 404 view catches a throw.
- Axe on the empty home page: the empty state now has an `h1`, and the 404 search box has a label.
- Markdown XSS: text is escaped, then a separate DOMPurify instance allowlists tags.
- Playwright waiting on `/api/health`: the web server waits on `/`, because health is 503 without a database.
- `/disclaimer` being treated as a section: the slug is reserved.

## What shipped

Legal pages render from `src/content/*.md` through `ContentPage`. Error pages are branded and do not show stacks. Security headers include a report-only CSP, with a Sentry `report-uri` when `SENTRY_DSN` is set. `/admin/analytics` is behind the existing editor gate. Copy-edit matching folds whitespace and a new assistant run clears the accepted stamp.

CI does not run `supabase start`. The e2e job builds with the same placeholder Supabase env as the check job and runs Playwright. Say so when you describe the suite: the full contributor-to-publish flow and the Stripe redirect are skipped until someone runs them with `E2E_FULL=1` against a seeded stack.

## Verify

`npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, then `npx playwright test`.

Production smoke (human, against the live URL): `BASE_URL=https://<domain> SMOKE_REQUIRE_DB=1 npm run e2e:smoke`.

Human steps: `docs/launch-checklist.md`.
