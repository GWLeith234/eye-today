# Sprint 10b — Real end-to-end tests

**Goal:** CI runs the real reader, contributor, newsletter, ads and support journeys against a seeded local database, so later sprints can't silently break them.

**Will work when done**

- CI starts a real local database (Supabase CLI, or Docker Postgres 16 + an auth/storage/role shim if `supabase start` won't run in CI), applies every migration and the seed.
- Test users are created per run (editor, contributor, reader) and Playwright signs in without email (test-only session helper, enabled only when `E2E_FULL=1` and never in production builds).
- Flows that actually run: contributor submit → editor requests changes → resubmit → publish → visible on the public site; newsletter double opt-in through a mock mailbox; ad campaign → approved creative → impression + click recorded; support checkout session created in Stripe test mode (mocked at the server boundary).
- The existing smoke and a11y projects keep running.

**Won't change:** No product features. No production data is touched.

**Definition of done:** `E2E_FULL=1` flow tests run and pass in CI on every PR, and fail if any of those journeys breaks.

Branch: `sprint-10b-e2e`, from the latest `main`.

## Pre-flight corrections

Verdict: **GO WITH CHANGES**. No new migration. `0001`–`0011` stay untouched.

| # | Severity | Area | Issue | Fix applied |
| --- | --- | --- | --- | --- |
| 1 | high | auth | Playwright cannot sign in against a bare Postgres shim. `getUser()` talks to GoTrue. | CI uses `supabase start` (auth, db, storage). Studio, realtime and the other unused containers are excluded. |
| 2 | high | build | `next build` always sets `NODE_ENV=production`, then CI runs `next start`. Gating the helper on `NODE_ENV !== "production"` would remove it from the very build CI runs. | The helper is compiled in only when `E2E_FULL=1` at **build** time (`next.config` `env`). Railway builds do not set that flag, so the session module is not in the production bundle. A unit test bundles the route with the flag empty and asserts the sign-in code is gone. |
| 3 | high | cookies | `next start` marks Supabase cookies `Secure`. CI's site is `http://127.0.0.1`, so the browser would drop them. | Cookie `secure` follows `SITE_URL` (https on Railway, http in this suite). |
| 4 | low | email | There was no `EMAIL_PROVIDER` switch. Confirm links only exist inside the message. | `EMAIL_PROVIDER=mock` appends messages to `E2E_MAILBOX_PATH`. Resend stays the default. |
| 5 | low | stripe | The webhook already ignores a replayed event id. The client still had to be stubbed. | `E2E_FULL=1` builds use an in-process Stripe double. The test asserts the session price and customer, then posts the same signed webhook twice. |

## Verify

`npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.

Full journeys (needs Docker): `bash scripts/e2e-database.sh` then the env block in `.github/workflows/ci.yml`, then `npx playwright test`.
