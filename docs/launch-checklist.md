# Launch checklist

Human steps before Eye Today is public. The code runs without these; the site is not ready to announce until they are done.

## Accounts and keys

- [ ] Create a Plausible site for the public domain. Set `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` and a server-only `PLAUSIBLE_API_KEY` (Stats API v2). Confirm `/admin/analytics` shows pageviews.
- [ ] Create a Sentry project for Next.js. Set `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` to the same DSN. Set `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` and `SENTRY_PROJECT` on the build so source maps upload. `SENTRY_DSN` is read when the site is built: the CSP report endpoint is included only if the DSN is present for that build. Confirm an intentional error arrives and does not contain an email or an Authorization header.
- [ ] Verify the Resend sending domain and point a webhook at `POST /api/webhooks/resend` with `RESEND_WEBHOOK_SECRET`. Set `RESEND_API_KEY`, `RESEND_FROM`, `NEWSLETTER_POSTAL_ADDRESS`, `NEWSLETTER_LINK_SECRET` and `SITE_URL`.
- [ ] Put Stripe live keys in the host only after test mode has been exercised. Run `scripts/stripe-seed.mjs` for the live prices and set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_ANNUAL` and `STRIPE_PRICE_ONCE`. Webhook: `POST /api/webhooks/stripe`.
- [ ] Set `CRON_SECRET`, `PREVIEW_SECRET` and `VIEW_HASH_SALT` to fresh values (`openssl rand -hex 32`). Schedule the publish cron against `POST /api/cron/publish`.

## Legal and editorial

- [ ] A lawyer reviews `src/content/privacy.md`, `terms.md`, `editorial-policy.md`, `corrections.md`, `disclaimer.md`, `contact.md`, `about.md` and `ad-policy.md`. They are drafts (`status: draft-for-legal-review` in front matter, not shown on the page).
- [ ] Write the clinic-relationship paragraph marked TODO on the editorial policy page.
- [ ] Confirm the crisis-resources line marked TODO on the disclaimer page.
- [ ] Publish the real newsroom email and postal address on the contact page, and the newsletter postal address required for CASL.
- [ ] Write who publishes Eye Today on the about page.

## Domain, hosting, database

- [ ] Attach the custom domain on Railway and set `SITE_URL` to that origin.
- [ ] Confirm Supabase backups and a point-in-time recovery plan. Do not launch on a project that cannot be restored.
- [ ] In the Supabase security advisor, confirm zero ERROR-level findings after migrations `0001`–`0011`.
- [ ] Auth today is magic link and Google. If email-and-password sign-in is ever turned on, enable Supabase leaked-password protection first.
- [ ] Turnstile production keys on `/write-for-us` (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`).

## Verify

- [ ] `npm run build` succeeds with the production env.
- [ ] Playwright smoke is green against the production URL: `BASE_URL=https://<domain> SMOKE_REQUIRE_DB=1 npm run e2e:smoke`.
- [ ] An unknown URL shows the custom 404. `/api/health` returns `{ "db": "ok" }`.
- [ ] CSP is still `Content-Security-Policy-Report-Only`. Read the reports for a week before enforcing it. Enforcing it will need `'unsafe-inline'` for Next.js, or it will break the site.
