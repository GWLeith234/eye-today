# Sprint 16 — Jobs & classifieds `REVENUE`

**Goal:** A paid job board and classifieds section for the field: clinics, research, harm reduction, training and services.

**Definition of done:** Create a job posting → pay in Stripe test mode → editor approves → it appears on /jobs with JobPosting JSON-LD → after its expiry date it disappears automatically.

**Won't change:** No applicant tracking. Applications go to the poster's own link or email. No substances in classifieds.

## Pre-flight (Claude, 2026-10-10): GO WITH CHANGES

Checked against `main` at `4aaf4a9` (migrations 0001–0016 in production, so 0017 is next).

| # | Severity | Area | Finding | Decision |
|---|---|---|---|---|
| 1 | blocker | Schema | The brief assumes 0001–0011. 0016 is live. | Migration `0017_postings.sql`. |
| 2 | high | RLS | Posters and editors share the `authenticated` role (same as events). | Posters write only through definer functions (`save_posting`). A write trigger re-forces safe values for anyone who is not an editor, admin, owner or service_role. Editors write directly under RLS. |
| 3 | high | Payments | `awaiting_payment` as a status adds a state that a cancelled checkout leaves behind. | Statuses: `draft`, `pending`, `published`, `expired`, `rejected`. Starting checkout keeps the row `draft`. A paid webhook moves it to `pending` (or extends a live posting). Payments go in `posting_payments` (unique checkout session id), which is the idempotency key alongside `stripe_events`. |
| 4 | high | Payments | The webhook must be applied atomically and must not touch memberships. | `apply_posting_payment(...)` is service-role only, in SQL, and inserts the payment and updates the posting in one statement block. `handleStripeEvent` routes `metadata.kind = "posting"` before membership logic, like featured listings. |
| 5 | high | Expiry | A separate cron needs Railway changes. | Public reads hide anything past `expires_at` or its closing date immediately. `/api/cron/publish` (already every 5 min) also calls `expire_postings()` to flip the status and revalidate. |
| 6 | high | Launch | With no prices set, nothing could ever be posted. | Prices come from `STRIPE_PRICE_POSTING_30` / `STRIPE_PRICE_POSTING_60`. When they're unset, posters can still save drafts and see "Paid posting isn't open yet". Editors can **approve without payment** (comp) with a chosen number of days. |
| 7 | high | Routes | `/jobs` and `/classifieds` would be caught by `/[section]` and `proxy.ts`. | Add `jobs` and `classifieds` to `RESERVED_SECTION_SLUGS`. `submit` is a reserved slug. |
| 8 | medium | AI | The claims check should not block payment or run on every keystroke. | An editor clicks "Check claims" on the admin posting page (reusing the claims prompt and schema). Nothing is stored. |
| 9 | medium | Refunds | Refunds through our API are out of scope. | Each payment stores its `payment_intent`. The admin page links to the Stripe dashboard for a refund. Reject requires a reason. |
| 10 | medium | JSON-LD | Google for Jobs needs `datePosted`, `validThrough`, `hiringOrganization`, `jobLocation` or `jobLocationType`. | Emit only what we hold. `TELECOMMUTE` for remote, `baseSalary` only when a range is given, and `directApply: false`. |
| 11 | low | Text | Descriptions are untrusted. | Plain text only, stored escaped, rendered as paragraphs. `<` and `>` are stripped in short fields. |

## Build summary
1. `0017_postings.sql`: tables `postings` and `posting_payments`, RLS forced, no anon table access, a write trigger, `save_posting`, `apply_posting_payment`, `expire_postings`, and public RPCs (`postings_list`, `postings_count`, `posting_by_slug`, `latest_jobs`, `jobs_for_listing`, `postings_sitemap`). Tests in `supabase/tests/0017_postings.sql`.
2. Stripe one-time checkout (30 or 60 days). The webhook branch is idempotent. Cron expiry runs inside the publish job.
3. Public `/jobs`, `/classifieds` (filters, detail pages, JobPosting JSON-LD), `/postings/new` and `/postings/policy`, plus nav, reserved slugs and the sitemap. "Latest jobs" appears on the cover and on directory listings.
4. `/account/postings`: status, edit (re-approval needed once submitted), pay or renew.
5. `/admin/postings`: queue, approve (or comp), reject with reason, check claims, Stripe refund links, edit.
6. Tests: SQL, unit (prices, expiry dates, JSON-LD, webhook routing), and e2e (create → stubbed checkout → signed webhook → approve → visible with JSON-LD → expired posting hidden).

## Env vars a human sets
- `STRIPE_PRICE_POSTING_30`, `STRIPE_PRICE_POSTING_60`: one-time Stripe prices. Posting payments stay closed until both are set, alongside `STRIPE_SECRET_KEY` and `SITE_URL`.
