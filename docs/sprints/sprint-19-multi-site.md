# Sprint 19 — Multi-site network `PLATFORM` (three sessions: 19a / 19b / 19c)

**Goal:** One platform runs several mastheads — Eye Today first, Iceland365 second — each with its own domain, brand, sections, newsletters, ads and directory, and with editors who can only see their own site.

**Pre-flight, 2026-10-13, against `main` = `cb13905` (migrations 0001–0028 applied):** the schema is ready for this, the code is not. Every table except `sites` and `stripe_events` carries `site_id`, but nothing uses it to keep sites apart:

| What | Today |
|---|---|
| Site resolution | None. `getSiteId()` (`src/lib/site.ts`) returns the first section's `site_id`; `src/proxy.ts` never looks at the Host header. |
| Public reads | 24 definer functions hard-code `sites.slug = 'eyetoday'` (directory, events, postings, polls, contests, editions, legal map, news links, tracker, platform links, survey). 79 definer functions have **no site filter at all** (`_live_articles`, `homepage_public`, `section_articles`, `search_articles`, `serve_ad`, `comments_for_article`, …). No public TS query applies `.eq("site_id")`. |
| Roles | One global `profiles.role`; `current_app_role()` has no site. 186 RLS policy lines across 18 migrations use it. No `site_members`. |
| Admin | List pages (`articles`, `media`, `sections`, `users`, …) rely on RLS alone, so they are cross-site. Writes take the site from `getSiteId()` or the parent row. |
| Brand | `sites` has only `id, name, slug, comments_enabled`. Colours live in `src/lib/brand/palette.ts` + `globals.css`; `SITE_NAME` is a constant; `SITE_URL`, `RESEND_FROM`, `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` are single env vars read in 21 files. |
| Tests | Playwright has one `baseURL`, no Host override. |

An analogy for the shape of the work: the building already has a separate mailbox for every tenant (`site_id` on every row), but there's one front-door key, one lobby directory, and the postman reads only the street name. 19a gives the postman the apartment number; 19b gives each tenant their own key; 19c lets each tenant paint their own door.

## The split

### 19a — Site resolution and data isolation (migration 0029)
The invisible sprint: Eye Today looks identical afterwards, but a second site on a second hostname shows only its own content.
1. `sites` gains `domains text[]` (unique across sites, lower-cased), `default_locale`, `features jsonb` (directory, events, comments, jobs, polls, editions, podcasts, survey). Seed Eye Today's domains: `theeye.today`, `www.theeye.today`, `eye-today-web-production.up.railway.app`, `localhost:3000`. Public read of `sites` limited to `id, name, slug, domains, features` through a definer `site_by_host(text)`.
2. `src/proxy.ts` resolves the site from `x-forwarded-host` / `host` → `site_by_host` (in-memory cache, 60 s), falls back to the default site (`eyetoday`) for unknown hosts, and passes it down as a request header (`x-site-id`, `x-site-slug`) that a `currentSite()` helper reads in server components, actions and route handlers. `getSiteId()` becomes a thin wrapper and is deleted at the end of 19b.
3. Every public definer function takes `p_site uuid` (or `p_host text`) and filters on it: replace the 24 `'eyetoday'` literals and add a filter to the 79 unfiltered ones. Do this as `create or replace` in 0029 with the same return types so the TS call sites change only by adding the argument. The base functions (`_live_articles`, `_servable_ads`, `_events_public`, `_postings_live`, …) are the leverage: most wrappers inherit from them.
4. The 19 `.rpc()` calls under `(public)` and `src/lib/public` and the direct `.from()` reads (`sections`, `articles` by slug, `tags`) pass / filter by `currentSite().id`.
5. SQL test 0029: two seeded sites; every public read function returns only site A's rows when asked for site A, and nothing for site B's host when B has no content. Playwright: a second project with `extraHTTPHeaders: { host: "iceland365.test" }` that asserts the cover, a section, the directory and `/api/ads/serve` return B's (empty) content and B's name.
6. Definition of done 19a: two hostnames, two sites, public pages isolated; Eye Today unchanged; all existing e2e green.

### 19b — Per-site roles and admin scoping (migration 0030)
1. `site_members (site_id, profile_id, role app_role, unique(site_id, profile_id))`, backfilled from `profiles.role` for Eye Today. `current_site_role(site uuid)` definer; `current_app_role()` stays for reader/supporter.
2. Rewrite the editorial policies (the 186 lines) to `current_site_role(site_id) in ('editor','admin')` (or contributor where that applies), migration by migration, with the existing SQL tests extended: editor of A cannot select/insert/update/delete B on every table. `profiles.role` keeps meaning "highest role anywhere" for `requireArea`; `getEditorContext()` gains the site.
3. Admin: site switcher in `admin/layout.tsx` (sites the user is a member of; cookie `site`), every admin list page filters `.eq("site_id", site.id)`, `getSiteId()` removed. Super-admin screen to create a site (name, slug, domains, features) and add members. Admin → Users becomes per-site membership.
4. Definition of done 19b: an editor of A signed in cannot see or edit B in admin or via the REST API (tested with a direct PostgREST call in e2e).

### 19c — Brand, feeds, mail, analytics per site (migration 0031)
1. `sites.brand jsonb` (paper, ink, brand, amber, rule, muted, fonts, wordmark media id, tagline, description) validated by a check; `sites.mail jsonb` (from name/address, postal address) and `sites.analytics jsonb` (Plausible domain). `SITE_NAME`, `SITE_DESCRIPTION`, `SITE_URL`, `RESEND_FROM`, `NEWSLETTER_POSTAL_ADDRESS`, `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` read from the site, env values become the Eye Today defaults for the migration backfill.
2. Layout sets the CSS variables from `site.brand`; wordmark component per site; `metadataBase`, sitemap, robots, RSS, JSON-LD publisher, newsletter sender and unsubscribe links per site.
3. Railway: one service, several custom domains (document in the status doc); `SITE_URL` goes away.
4. Seed Iceland365 as a placeholder brand in `seed.sql` (and in production only when George says so).
5. Definition of done 19c: Iceland365 on its hostname shows its own name, colours and wordmark, sends newsletters from its own address, has its own sitemap and Plausible domain.

## Decisions for George
- Second masthead: **Iceland365** (EvolveX360's travel title) — confirm, and whether it launches with the directory/events/jobs switched on or stories + newsletter only.
- Is one Supabase project for all mastheads acceptable (yes for the model above), or must Iceland365 have its own database (then this sprint is a deploy template instead)?
- Order: 19a is required before anything else. 19b before Jeff or any other editor is invited to a second site. 19c can follow at leisure.

## Not in scope
Cross-site content sharing, per-site code forks, per-site Stripe accounts (one account, metadata carries the site).

## Rollback
Each session is its own PR and migration; `git revert` the merge and a new migration undoes the DDL. 19a's function replacements are reversible by re-running the previous definitions (kept in the migration as comments).

## Build rules (unchanged)
Branch `sprint-19a-site-resolution` from `main`; migration 0029; `supabase/tests/0029_*.sql`; guarded apply script; lint, typecheck, unit, e2e green; PR via REST; George applies the migration, then merge, then smoke test on both hostnames (the Railway host and a `Host:` override).
