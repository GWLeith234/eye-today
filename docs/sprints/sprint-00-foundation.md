# Sprint 0 — Foundation & schema `INFRA` `BLOCKER` (~2.5 h)

**Goal:** A deployed Next.js shell on Railway talking to a Supabase database that holds the whole MVP data model.

## Will work when done

- Repo scaffolded; `/` renders a placeholder masthead on the Railway URL
- Supabase project linked; all MVP tables migrated with RLS enabled
- Seed script creates the site, sections and one sample article
- GitHub Actions runs lint + typecheck + build on every PR
- `.env.example` documents every variable

**Won't change:** No UI design, no auth flows, no editor yet.

**Definition of done:** Railway URL → loads placeholder → `/api/health` returns `{db:"ok"}`.

## Workflow for this sprint

1. Copy the sprint file into the repo at `docs/sprints/`.
2. Step 1 — Cursor pre-flight review (no code). Apply its fixes or use its corrected prompt.
3. Step 2 — Claude Code build with the prompt below (session header already included).
4. Step 3 — Cursor debug pass on the committed branch.
5. Step 4 — QA: ask Claude for this sprint's verification cards for Claude in Chrome, then merge.

## Step 2 — Claude Code build prompt

```
SPRINT 0 — Foundation & schema
SESSION HEADER — Eye Today
You are working on Eye Today — a Next.js 16 (App Router, TypeScript, Tailwind) news portal
on Supabase (Postgres/Auth/Storage), deployed on Railway. Repo: eye-today.
Sprint docs live in docs/sprints/. Read docs/sprints/sprint-00-foundation.md before starting.
The master index lists later sprints for context only; build nothing from them.
Rules:
- Work only within this sprint's scope. Create the branch sprint-0-foundation before changing anything.
- This repo must be empty of application code (docs/ and .git are expected). If it already contains apps/web,
  Evolved Pros migrations, or a Railway health contract, stop.
- All DB changes go in supabase/migrations as NEW files. This sprint's only migration is 0001_core.sql.
- Never commit secrets. Every variable goes in .env.example.
- Never prefix the service-role key with NEXT_PUBLIC_.
- Do not install TipTap, Resend, Stripe, or the Anthropic SDK.
- Run npm run lint, npx tsc --noEmit, and npm run build before committing.
- Link or deploy only to a new Supabase project and a new Railway service.
- End by summarising what changed, files touched, and how to verify.

Scaffold the Eye Today platform and create the full MVP data model.

1. Scaffold (create-next-app refuses a folder that already has docs/ in it):
   mv docs /tmp/eye-today-docs
   npx create-next-app@16 . --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --yes
   mv /tmp/eye-today-docs docs
   If any flag is rejected, run npx create-next-app@16 --help and use the equivalent; do not fall back to an older major.
   Confirm package.json shows next 16.x (>= 16.2.5) and "lint": "eslint" (next lint no longer exists in 16).
   Add "engines": { "node": ">=24" } and an .nvmrc containing 24.
   Install: @supabase/ssr @supabase/supabase-js zod date-fns server-only
   Folders: src/app/(public), src/app/(admin), src/lib/supabase, src/components.
   The only page is src/app/(public)/page.tsx: a server component whose text masthead reads "Eye Today".
   Delete the default src/app/page.tsx so the (public) route owns "/".
   No client components, no proxy.ts (Next 16's replacement for middleware.ts), no auth, no editor.

2. Supabase: supabase init. Do not link unless SUPABASE_PROJECT_REF refers to a new empty project.
   Add supabase/migrations/0001_core.sql:
   - sites (id, name, slug unique, created_at, updated_at). No site_id column.
   - Every other table has site_id → sites(id), created_at, updated_at, and a shared set_updated_at trigger.
   - All trigger functions: SET search_path = '' and schema-qualify every reference (Supabase advisor requirement).
   - profiles (id → auth.users on delete cascade, display_name, bio, avatar_url, role app_role not null default 'reader').
     app_role: reader, supporter, contributor, editor, admin. One profile per auth user.
   - sections (slug, name, sort, parent_id self-FK on delete set null). Unique (site_id, slug).
   - tags (slug, name). Unique (site_id, slug).
   - media (storage_path, alt, credit, caption, width, height).
   - articles (section_id, slug, title, dek, body_json jsonb, body_html, hero_media_id → media,
     status article_status not null default 'draft', is_sponsored boolean not null default false,
     sponsor_name, published_at, scheduled_for, seo_title, seo_description, search tsvector).
     article_status: draft, submitted, in_review, scheduled, published, archived.
     Unique (site_id, slug). Index (site_id, status, published_at desc).
     Trigger maintains search from title (A), dek (B) and body_html stripped of tags (C). GIN index on search.
   - article_authors (article_id, profile_id, sort int, primary key (article_id, profile_id)).
   - article_tags (article_id, tag_id, primary key (article_id, tag_id)).
   - article_revisions (id, article_id, body_json, body_html, created_at).
   - disclosures (profile_id, text).
   - newsletter_lists, newsletter_subscribers, newsletter_issues.
   - ad_slots, ad_campaigns, ad_creatives, ad_events.
   - membership_tiers, memberships, audit_log.
   RLS: ENABLE and FORCE on every table including sites.
   Policies in this file, not deferred:
   - anon and authenticated may SELECT sections.
   - anon and authenticated may SELECT articles only when status = 'published'
     AND published_at IS NOT NULL AND published_at <= now().
   - No insert, update, or delete policies. service_role bypasses RLS and is the only writer.
   Grants: REVOKE ALL from anon and authenticated on all of these tables, then GRANT SELECT
   on sections and articles only. (media gets a read policy in Sprint 4 when hero images render.)
   src/lib/supabase/admin.ts starts with import "server-only" and is not imported by the health route.

3. Seed in supabase/seed.sql (so supabase db reset applies it): one site slug eyetoday named "Eye Today";
   sections News, Research & Science, Policy & Law, Treatment & Clinics, Stories, Opinion;
   one published article in News with published_at = now() - interval '1 hour'.
   No auth.users row and no article_authors row. Use fixed UUIDs. ON CONFLICT DO NOTHING so a second reset is safe.
   If seeding fails with an RLS error, the seed role lacks BYPASSRLS — report it; do not drop FORCE RLS.

4. src/app/api/health/route.ts: export const dynamic = "force-dynamic".
   Inside GET, create a plain client with createClient from @supabase/supabase-js
   (anon key, auth: { persistSession: false }) — no cookies needed. select id from sections limit 1.
   200 {db:"ok"} when the query returns no error. 503 {db:"error"} when env is missing or the query errors.
   Cache-Control: no-store. Do not include the Supabase error text in the body.
   Do not use the service role.

5. CI: .github/workflows/ci.yml on pull_request. Node 24. npm ci, npm run lint, npx tsc --noEmit, npm run build.
   Build env: NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co and a placeholder anon key.
   The health route must not throw while those placeholders are set and no database is reachable at build time.

6. railway.toml: leave the builder at Railway's default (Railpack); set healthcheckPath = "/api/health",
   healthcheckTimeout = 30. Node version comes from engines/.nvmrc.
   .env.example documents NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
   SUPABASE_SERVICE_ROLE_KEY (server only), and optional SUPABASE_PROJECT_REF (link only, not NEXT_PUBLIC_).
   Deploy only if a new Railway service is already available. Do not point an existing Evolved Pros service at this app.

Verify: / renders "Eye Today". /api/health returns {"db":"ok"} against the seeded database.
supabase db reset completes twice in a row on a fresh local database. npm run lint, npx tsc --noEmit,
and npm run build pass. npm ls next shows 16.x.
Branch: sprint-0-foundation
```

## Step 3 — Cursor debug pass

Run after the build is committed. Fix bugs only. Run lint/typecheck/build, walk the definition of done,
hunt for missing awaits, RLS bypass via service role, secrets in client bundles; confirm
`supabase db reset` runs cleanly on a fresh DB. Output: bugs fixed, human decisions needed, Ready to merge YES/NO.

## Rollback

`git revert HEAD` · `supabase db reset` to last good migration
