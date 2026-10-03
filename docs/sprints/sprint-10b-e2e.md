# Sprint 10b — Real end-to-end tests

**Goal:** CI runs the real reader, contributor, newsletter, ads and support journeys against a seeded local database, so later sprints can't silently break them.

**Definition of done:** `E2E_FULL=1` flow tests run and pass in CI on every PR, and fail if any of those journeys breaks.

Branch: `sprint-10b-e2e` (built on `claude/exciting-planck-gvvnbs`). No product features. No production data is touched. Rollback: `git revert` the merge commit (CI, test and test-double changes only).

## Will work when done

- CI starts a real local database (Supabase CLI), applies every migration and the seed.
- Test users (editor, contributor, reader) are created per run and Playwright signs in without email.
- Flows that actually run:
  - contributor submit → editor requests changes → resubmit → publish → visible on the public site;
  - newsletter double opt-in through a mock mailbox, then one-click unsubscribe;
  - ad campaign → approved creative → impression + click recorded;
  - support checkout session created in Stripe test mode (mocked at the server boundary), webhook replay safe.
- The existing smoke and a11y projects keep running (the unchanged `e2e` job).

## How it is built

### CI database: `supabase start` (not the Postgres shim)

The app talks to PostgREST, GoTrue and Storage over HTTP, so a bare `postgres:16` container plus an `auth`/`storage` SQL shim could not serve a single page. The shim route would still need those three services, so the sprint uses the Supabase CLI. `supabase start` applies `supabase/migrations/*` and `supabase/seed.sql` itself. The job excludes services the app never calls (studio, realtime, imgproxy, edge-runtime, logflare, vector, supavisor, postgres-meta, mailpit) to keep start-up short.

The production build is made **after** the stack is up, because `NEXT_PUBLIC_SUPABASE_*` are inlined at build time.

### Two CI jobs

- `e2e` (unchanged): placeholder Supabase, `npx playwright test`. Smoke, axe and the no-side-effect flows. The full flows `test.skip` themselves there.
- `e2e-full` (new): seeded local stack, `E2E_FULL=1 npx playwright test --project=flows`.

### Test sign-in: no route in the app

The session helper is `e2e/helpers/users.ts`. It lives only under `e2e/`, so no route or helper exists in any production build to be switched on by mistake. It creates the user with the GoTrue admin API, sets the role over a direct `postgres` connection (the `profiles_lock_role` trigger rejects every other path, including the service role), asks GoTrue for a magic link without sending mail, and opens the app's own `/auth/callback?token_hash=…` in the browser. That is the same code path a real sign-in link takes.

The helper refuses to run unless `E2E_FULL=1`, `NODE_ENV` is not `production`, and every Supabase and database URL is `localhost` or `127.0.0.1`, so it can never touch a hosted project. `src/lib/e2e-isolation.test.ts` proves that guard and proves nothing under `src/` can create a session outside the normal login routes.

### Mock providers (server boundary, env-gated, off by default)

| Switch | Needs | Effect |
| --- | --- | --- |
| `EMAIL_PROVIDER=mock` | `E2E_MAILBOX_DIR` | `sendMail` and the newsletter provider append each message (to, subject, text, html, headers) to `$E2E_MAILBOX_DIR/mailbox.jsonl` instead of calling Resend. |
| `STRIPE_PROVIDER=mock` | `E2E_RECORD_DIR` | `getStripe()` returns a recording double. Customer and checkout-session calls are written to `$E2E_RECORD_DIR/stripe.jsonl`. Webhook signatures are still verified by the real Stripe library with a test secret. |

With either variable missing the real provider is used, so production behaviour is unchanged.

## Verify

Always: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npx playwright test` (placeholder mode: smoke, axe, and the flows that need no stack; the full journeys skip).

The full journeys, locally (needs Docker):

```
npx supabase start -x studio,realtime,imgproxy,edge-runtime,logflare,vector,supavisor,postgres-meta,mailpit
eval "$(npx supabase status -o env)"          # API_URL, ANON_KEY, SERVICE_ROLE_KEY, DB_URL
export E2E_FULL=1 SITE_URL=http://127.0.0.1:3000 \
  NEXT_PUBLIC_SUPABASE_URL=$API_URL NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY \
  SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY E2E_DATABASE_URL=$DB_URL \
  STRIPE_SECRET_KEY=e2e-mock STRIPE_WEBHOOK_SECRET=e2e-mock-webhook \
  STRIPE_PRICE_MONTHLY=price_e2e_monthly STRIPE_PRICE_ANNUAL=price_e2e_annual STRIPE_PRICE_ONCE=price_e2e_once \
  CRON_SECRET=e2e-cron NEWSLETTER_POSTAL_ADDRESS="1 Test St" NEWSLETTER_LINK_SECRET=e2e-link
npm run build && npm run e2e:full
```

Reproducing a CI failure: the `e2e-full` job uploads `playwright-report/` and `test-results/` (traces) as an artifact.

## What was and was not run before this was pushed

Run: lint, typecheck, unit tests (including the new mock-provider and isolation tests), `next build`, and the placeholder-mode Playwright suite (13 passed, 9 skipped, all skips being the new full journeys). Also run: every migration and the seed against a local Postgres 16 with a minimal auth/storage shim, and the SQL the tests issue against it.

Not run: the `e2e-full` job itself. The authoring sandbox could not pull the Supabase container images, so `supabase start`, GoTrue sign-in and the five full journeys were written against the code but first execute in CI. Treat the first CI run of `e2e-full` as the real verification and expect to adjust selectors or timings from its report.
