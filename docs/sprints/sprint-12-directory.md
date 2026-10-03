# Sprint 12 — Directory I — listings, search & legal status

**Goal:** Readers can find clinics, practitioners and support services, with honest information about what each one is, how it was checked, and the legal status where it operates.

**Will work when done**

- **Categories** (editable table, seeded): treatment clinic/retreat, medical practitioner, integration coach/therapist, harm-reduction service, peer support group, research organisation, advocacy group. Editors can hide any.
- **Listings:** name, slug, category, country (ISO code), region, city, services (tags), languages, website, public email/phone, short description (editor-approved), logo/photos (media library), `last_reviewed_at`, and a verification level: `listed` / `verified` / `medically_supervised`. The criteria are a draft at `/directory/how-we-verify`.
- **Country legal-status pages:** one per country, editor-written, with sources and an "as of" date. Starter rows for MX, CR, PT, NL, BR, CA, US, ZA, NZ, GB are hidden drafts with empty text. Nothing is auto-written. Other countries are created by editors.
- **Public:** `/directory` (search + filters by country, category, service, verification, 24 per page), `/directory/[country]`, `/directory/listing/[slug]`, each with the medical/legal disclaimer and the publisher-relationship disclosure when it is set.
- **Submissions:** public "Add a listing" form (Turnstile + rate limit) → `/admin/directory`. Approve creates a draft listing. Editors set the verification level (a note is required) and publish. Unapproved rows are invisible to anon.
- **Safeguards:** no star ratings or reader reviews. The claims check flags dosing and outcome claims and never edits the text. Ordering is alphabetical, or relevance when there is a query. Nothing is paid.
- **SEO:** `MedicalClinic` or `LocalBusiness` JSON-LD using only stored fields, directory sitemap, canonical URLs.

**Won't change:** No paid placement, no listing claims, no map. No reader reviews.

**Definition of done:** Submit a listing → editor approves with level `verified` → it appears in `/directory` filtered by its country and category with the right badge, legal-status link and disclaimer. An unapproved submission is invisible to anon via the API.

Branch: `sprint-12-directory`, from the latest `main`.

## Pre-flight corrections

Verdict: **GO WITH CHANGES**.

| # | Severity | Area | Issue | Fix applied |
| --- | --- | --- | --- | --- |
| 1 | blocker | schema | `0012` is already used by the unmerged design sprint (`0012_section_brand.sql`). Two files with the same version cannot both apply. | This sprint is `0013_directory.sql`. It does not depend on `0012`. |
| 2 | high | RLS | A public query that forgets `status = published` would leak drafts. Submissions must not be readable by anon. | Public search, listing, legal status, services and sitemap go through security-definer functions that only return published rows. Anon has no privileges on `listing_submissions`. Inserts go through `submit_directory_listing`. |
| 3 | high | media | Anon can read `media` only when it is the hero of a live article. Listing logos would be empty. | New select policy: media used by a published listing in a visible category. |
| 4 | high | AI | `ai_suggestions.article_id` is required, and the kind check does not include listings. `0007` must not be edited. | The editor action calls Claude and shows flags. It does not write `ai_suggestions` and does not change the description. Missing `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` leaves the check unavailable and does not block saving. |
| 5 | high | seed | Migrations run before `seed.sql` creates the site, so a migration insert matches zero rows on a fresh reset. | Categories and the ten empty legal drafts are inserted in the migration for sites that already exist, and again in `seed.sql` for the local site. |
| 6 | low | routes | `/[section]` and the slug-redirect proxy treat the first path segment as a section. | `directory` is reserved. Country codes live under `/directory/`, not at the top level. |
| 7 | low | design | Sprint 11 (masthead, section colours) is not on `main`. | This sprint uses the current header, footer and palette. |
| 8 | low | tests | The full submit → approve journey needs GoTrue, Turnstile and `E2E_FULL=1`. The default CI check job has none of those. | The flow is skipped unless `E2E_FULL=1`. The e2e job sets Cloudflare's always-pass test keys. Placeholder smoke only checks that the pages render. |

No new env vars. Turnstile and the assistant stay no-ops when their existing variables are unset.

## Verify

`npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.

SQL (needs a local stack): `npx supabase db reset`, then `psql` against the local database with `supabase/tests/0013_directory.sql`.

Full journey: the e2e job in `.github/workflows/ci.yml` (`E2E_FULL=1`).
