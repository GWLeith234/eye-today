# Sprint 0 — Verification cards (Claude in Chrome)

Run these in order in Chrome. Each card says where to go, what to do, and what counts as a pass.
Record **PASS / FAIL** plus a one-line note (or a screenshot) for each card.
Nothing in these cards changes data. Card V8 writes a test row, then rolls it back.

| Constant | Value |
| --- | --- |
| `APP` | `https://eye-today-web-production.up.railway.app` |
| `SB` | `https://zlvxynrtijexxryinirw.supabase.co` |
| `KEY` | `sb_publishable_cGPgEUqxz2vpEAKi38IWSA_ZsoZvEjR` (public / anon key — safe to share) |
| Supabase dashboard | `https://supabase.com/dashboard/project/zlvxynrtijexxryinirw` |
| Railway project | Eye Today → service `eye-today-web` |
| PR | `https://github.com/GWLeith234/eye-today/pull/1` |

Never paste the service-role / secret key into Chrome, a URL, or these notes.

---

## Part A — Public site (definition of done)

### V1 · Home page shows the masthead
- **Go to:** `APP/`
- **Do:** Let the page load, then open DevTools → Console.
- **Pass if:**
  - The heading reads **Eye Today**, with "Coming soon" under it.
  - The tab title is **Eye Today**.
  - The Console shows no red errors (a missing-favicon 404 is OK).
- **Fail if:** blank page, a Next.js error overlay, "Application failed to respond", or Railway's 404 page.

### V2 · Health endpoint reports the database is up
- **Go to:** `APP/api/health`
- **Do:** Open DevTools → Network, reload, and click the `health` request.
- **Pass if:**
  - The body is exactly `{"db":"ok"}`.
  - The status is **200**.
  - The response headers include `cache-control: no-store`.
- **Fail if:** `{"db":"error"}`, status 503, or any Supabase error text in the body (the endpoint must never leak it).

### V3 · Health is live, not cached
- **Go to:** `APP/api/health?x=1`, then `APP/api/health?x=2`
- **Pass if:** both return 200 `{"db":"ok"}`, and the Network tab shows each one fetched from the network, not "(disk cache)".

### V4 · Unknown routes 404 cleanly
- **Go to:** `APP/does-not-exist`
- **Pass if:** the default Next.js 404 page loads with status **404** and no stack trace.

### V5 · No server secrets in the browser bundle
- **Go to:** `APP/`
- **Do:** Open DevTools → Sources. Press Ctrl/Cmd+Shift+F to search all files. Search each of these in turn:
  1. `SERVICE_ROLE`
  2. `service_role`
  3. `sb_secret`
- **Pass if:** each search finds **0 results**.
- **Fail if:** any result appears in a `/_next/static/...` file. If so, stop and report it.

---

## Part B — Database access rules, tested as an anonymous visitor

These cards call Supabase's public API straight from the address bar, using the public key as a query parameter. Chrome shows JSON.

### V6 · Sections are public
- **Go to:** `SB/rest/v1/sections?select=name,slug,sort&order=sort&apikey=KEY`
- **Pass if:** the response is a JSON array of **exactly 6** sections, in this order:
  News, Research & Science, Policy & Law, Treatment & Clinics, Stories, Opinion.

### V7 · Only the published article is public
- **Go to:** `SB/rest/v1/articles?select=slug,title,status,published_at&apikey=KEY`
- **Pass if:**
  - The array has **exactly 1** item: `welcome-to-eye-today`, "Welcome to Eye Today".
  - Its `status` is `"published"` and its `published_at` is in the past.

### V8 · Drafts and future-dated articles stay hidden (dashboard SQL editor)
- **Go to:** Supabase dashboard → **SQL Editor** → New query.
- **Do:** Run this. It inserts two test articles, checks what the public role can see, then undoes everything:
  ```sql
  begin;
  insert into public.articles (site_id, section_id, slug, title, status, published_at) values
    ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000101','qa-draft','QA draft','draft',null),
    ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000101','qa-future','QA future','published', now() + interval '1 day');
  set local role anon;
  select string_agg(slug, ',') as anon_visible from public.articles;
  rollback;
  ```
- **Pass if:** `anon_visible` is exactly `welcome-to-eye-today`, with no `qa-draft` and no `qa-future`.
- **Then:** re-run the V7 URL. It must still show exactly 1 article, which proves the rollback worked.

### V9 · Private tables are locked
- **Go to** each URL:
  - `SB/rest/v1/sites?select=*&apikey=KEY`
  - `SB/rest/v1/profiles?select=*&apikey=KEY`
  - `SB/rest/v1/media?select=*&apikey=KEY`
  - `SB/rest/v1/audit_log?select=*&apikey=KEY`
  - `SB/rest/v1/newsletter_subscribers?select=*&apikey=KEY`
- **Pass if:** every one returns an error JSON with `"code":"42501"` and a message like `permission denied for table …`.
- **Fail if:** any returns `[]` or data. An empty array means the table can be read, so it counts as a fail.

### V10 · Anonymous writes are rejected (DevTools console)
- **Go to:** `SB/rest/v1/` (any page on that origin works), then open DevTools → Console.
- **Do:** paste and run:
  ```js
  fetch("/rest/v1/sections", {
    method: "POST",
    headers: { apikey: "sb_publishable_cGPgEUqxz2vpEAKi38IWSA_ZsoZvEjR", "Content-Type": "application/json" },
    body: JSON.stringify({ site_id: "00000000-0000-4000-8000-000000000001", slug: "qa-hack", name: "QA hack" })
  }).then(r => r.text().then(t => console.log(r.status, t)));
  ```
- **Pass if:** the status is **401 or 403** and the body contains `42501` / `permission denied`.
- **Then:** re-run the V6 URL. It must still show exactly 6 sections.

---

## Part C — Schema and security (Supabase dashboard)

### V11 · All MVP tables exist, with RLS forced
- **Go to:** SQL Editor → New query.
- **Do:** Run:
  ```sql
  select
    count(*) filter (where c.relrowsecurity)      as rls_enabled,
    count(*) filter (where c.relforcerowsecurity) as rls_forced,
    count(*)                                      as tables,
    (select string_agg(version || '_' || name, ',') from supabase_migrations.schema_migrations) as migrations
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r';
  ```
- **Pass if:** `tables = 20`, `rls_enabled = 20`, `rls_forced = 20`, `migrations = 0001_core`.

### V12 · Only two public-read policies exist
- **Do:** Run:
  ```sql
  select tablename, policyname, cmd, roles from pg_policies where schemaname = 'public' order by 1;
  ```
- **Pass if:** exactly 2 rows come back:
  - `articles`: "published articles are publicly readable", `SELECT`, `{anon,authenticated}`
  - `sections`: "sections are publicly readable", `SELECT`, `{anon,authenticated}`
- **Fail if:** there is any INSERT, UPDATE, DELETE or ALL policy.

### V13 · Search vector is maintained
- **Do:** Run:
  ```sql
  select title, search from public.articles where slug = 'welcome-to-eye-today';
  ```
- **Pass if:** `search` is not empty. It should contain entries like `'eye':…A`, `'health':…B` and `'cover':…C`, and no leftover HTML such as `'p'`.

### V14 · Security Advisor is clean
- **Go to:** Dashboard → **Advisors → Security Advisor**, then click Refresh/Rerun.
- **Pass if:** there are **0 Errors** and **0 Warnings**. Info items that say "RLS Enabled No Policy" on the 18 private tables are expected, since those tables are locked on purpose.
- **Fail if:** any "RLS Disabled", "Function Search Path Mutable", or "Security Definer View" finding appears.

---

## Part D — Hosting and CI

### V15 · Railway deploy is healthy
- **Go to:** Railway → Eye Today → `eye-today-web` → **Deployments**.
- **Pass if:**
  - The latest deployment is **Active / Success**.
  - The Settings tab shows the healthcheck path `/api/health` and timeout 30.
  - Networking shows the domain `eye-today-web-production.up.railway.app`.
- **Note:** the source branch is currently `claude/friendly-cray-tf2xmd`. After PR #1 merges it must switch to `main`, which is tracked as a follow-up and doesn't count as a fail now.

### V16 · Railway variables are correct
- **Go to:** `eye-today-web` → **Variables**. Look at the names only; don't reveal the values.
- **Pass if all of these hold:**
  - These names are present: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
  - No variable name contains both `NEXT_PUBLIC_` and `SERVICE` or `SECRET`.
  - `NEXT_PUBLIC_SUPABASE_URL` points at `zlvxynrtijexxryinirw`, not an Evolved Pros or Evolved Today project.

### V17 · CI is green and the repo has no secrets
- **Go to:** the PR → **Checks** tab.
- **Pass if:** `CI / check` is green, with lint, typegen, tsc and build all passing.
- **Then go to:** PR → **Files changed**.
- **Pass if:**
  - `.env.example` is present, and every value in it is blank.
  - No `.env`, `.env.local` or other `.env*` file is committed.
  - No secret key appears anywhere in the diff. Only two key-like strings are allowed: the CI placeholder `placeholder-anon-key`, and the public `sb_publishable_…` key in this verification doc.
  - Anything starting with `sb_secret_`, or any JWT whose payload says `service_role`, is a fail.

---

## Sign-off

| Card | Result | Note |
| --- | --- | --- |
| V1 | | |
| V2 | | |
| V3 | | |
| V4 | | |
| V5 | | |
| V6 | | |
| V7 | | |
| V8 | | |
| V9 | | |
| V10 | | |
| V11 | | |
| V12 | | |
| V13 | | |
| V14 | | |
| V15 | | |
| V16 | | |
| V17 | | |

**Merge when:** V1–V17 are all PASS. V1, V2, V5, V7, V9 and V10 are blockers. Any other failure gets a note and a decision.
