# Eye Today

News portal on Next.js 16 (App Router, TypeScript, Tailwind) + Supabase, deployed on Railway.
Sprint plans live in [`docs/sprints/`](docs/sprints/).

## Local development

Requires Node 24 (`.nvmrc`) and Docker (for the local Supabase stack).

```bash
npm install
npx supabase start          # prints the local API URL and anon key
cp .env.example .env.local  # fill in NEXT_PUBLIC_SUPABASE_URL / ANON_KEY
npx supabase db reset       # applies supabase/migrations + supabase/seed.sql
npm run dev
```

- `/` — placeholder masthead
- `/api/health` — `200 {"db":"ok"}` when the database answers, `503 {"db":"error"}` otherwise
- `/login` — email magic link (and Google once it is configured)
- `/account` — any signed-in user · `/contribute` — contributor+ · `/admin` — editor+ · `/admin/users` — admin

Locally, sign-in emails land in the mail catcher that `npx supabase start` prints (Mailpit/Inbucket URL).

## Checks

```bash
npm run lint
npm test            # node:test — HTML sanitizer, mail fallback
npm run typecheck   # next typegen && tsc --noEmit
npm run build
```

## Newsroom CMS

Editors and admins work in `/admin`: articles (TipTap editor with images, pull quotes, YouTube and
X/Instagram embeds), media, sections and tags. On save the server rebuilds HTML from the editor JSON
with the same extensions and sanitizes it (`src/lib/editor/`); the browser's HTML is never stored.
Every save and every restore adds a row to `article_revisions`.

- **Publish** sets `published_at = now()`. **Schedule** sets `scheduled_for`; the article is public
  from that moment (RLS), and the cron later flips its status to `published`.
- **Preview** (`/preview/<id>?token=…`) needs a signed-in editor and an hour-long HMAC token.
- **Media** uploads go straight from the browser to the `media` bucket; the server then checks the
  file's real bytes (JPEG/PNG/WebP/GIF only) and records width, height, alt, credit and caption.
- Public articles live at `/articles/<slug>`.

### Scheduled publishing cron (Railway)

The web service stays a long-running server; do **not** add a cron schedule to it. Create a second
Railway service in the same project for the cron:

1. New service → Empty service (or any small image with `curl`, e.g. `curlimages/curl`).
2. Settings → Cron Schedule: `*/5 * * * *` (no more often than every 5 minutes).
3. Start command:
   `curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://eye-today-web-production.up.railway.app/api/cron/publish`
4. Variables: `CRON_SECRET` — the same value as on the web service.

`POST /api/cron/publish` returns `{"published": n}`, or `401` without the right bearer token.

## Contributors and editorial review

- **/write-for-us** — public application form, protected by Cloudflare Turnstile (verified on the
  server). The database allows one pending application per email and at most three per email per
  24 hours; the form shows the same thank-you message either way.
- **/admin/applications** — editors approve (invite + `grant_contributor`) or reject with a reason.
- **/contribute** — contributors write drafts, keep a disclosure (required to submit), and see
  editor notes. They can only save or submit their own drafts; the database refuses anything else.
- **/admin/review** — the queue of submitted stories: start review, request changes (with a note),
  approve & schedule, or publish.
- Live articles show each author's name and disclosure (`article_bylines`), never their email.
- Email (Resend) goes out on submit, changes requested and publish. If `RESEND_API_KEY` /
  `RESEND_FROM` are missing or sending fails, the action still succeeds and shows a warning.

Dashboard steps for these (hosted): add a Turnstile widget in Cloudflare and set
`NEXT_PUBLIC_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` on Railway; verify a sending domain in
Resend and set `RESEND_API_KEY` + `RESEND_FROM`.

## Public site

- **/** — lead story + four secondary (curated at **/admin/homepage**, empty slots fill with the
  newest live stories), The Latest, Most Read, Opinion and a rail per section. Ad slots are
  placeholders labelled "Advertisement".
- **/{section}/{slug}** — the canonical article URL: bylines linking to **/author/{slug}**, published
  and updated times, hero with credit, share links (no SDKs), disclosures, the medical disclaimer,
  related stories. Old **/articles/{slug}** links redirect here. "Sponsored" stories name the sponsor.
- **/{section}**, **/tag/{slug}**, **/author/{slug}** — 20 per page, `?page=1..100`.
- **/search?q=&section=** — ranked full-text search over live articles (`search_articles` in
  `0006_seo.sql`): title matches outrank dek and body matches, with a highlighted snippet. noindex.
- Static pages: /about, /contact, /advertise, /editorial-policy, /corrections, /privacy, /terms,
  /newsletter and /support (signup and payments are not open yet).
- Section slugs that match an app path (see `src/lib/public/reserved.ts`) are refused.
- Views: the article page POSTs once to **/api/view**, which stores only
  `sha256(VIEW_HASH_SALT:ip)` and counts one view per visitor per article per day. Always 204.
- Caching: the homepage and article pages revalidate every 60 seconds; publishing, scheduling,
  unpublishing, the review actions and the cron job also clear them straight away. The header
  decides "Sign in" / "Account" in the browser so public pages carry no cookies.
- Public reads go through `SECURITY DEFINER` functions in `0005_frontend.sql` that return live
  articles only, with no emails or roles; anon still cannot read `profiles`.

Hosted: set `VIEW_HASH_SALT` (and `SITE_URL` for absolute canonical/share URLs) on Railway.

## SEO

- **/sitemap.xml** (home, sections, live articles, static pages), **/news-sitemap.xml** (editorial
  stories from the last 48 hours; sponsored stories are left out), **/robots.txt**, **/rss.xml** and
  **/{section}/rss.xml**. All list live articles only and refresh hourly; publishing, scheduling and
  unpublishing also clear them straight away.
- Article pages carry one JSON-LD block: `NewsArticle` for editorial stories, `Article` for
  sponsored ones. Share cards are drawn by `opengraph-image.tsx`; the stable URL
  `/{section}/{slug}/opengraph-image` serves the same image (Next names the file route with a hash
  because of the `(public)` group).
- Canonicals are relative and become absolute through `metadataBase` when `SITE_URL` is set. Set
  `SITE_URL` in production: sitemaps, feeds and JSON-LD need absolute URLs to be valid.
- Renaming an article's slug or moving it to another section keeps its old address: the proxy
  answers `/{old section}/{old slug}` with a 308 to the current path (`slug_history`,
  `article_slug_redirect`), and `/articles/{old slug}` redirects the same way. Only live articles
  redirect, and a slug reused by another article belongs to that article.

## Auth and roles

Roles rank `reader = supporter < contributor < editor < admin`. `src/proxy.ts` and the server
layouts both apply the rules in `src/lib/auth/access.ts`; the database enforces them again with RLS.
New users always start as `reader` (signup trigger). Roles change only through
`public.set_user_role()`, which only an admin can call, never on themselves, and never removing a
site's last admin. `/admin/users` invites people and sets their role.

### Dashboard steps for a hosted project (not in code)

In Supabase → Authentication:

1. **URL Configuration** → Site URL = the Railway origin
   (`https://eye-today-web-production.up.railway.app`). Add these redirect URLs:
   - `https://eye-today-web-production.up.railway.app/auth/callback`
   - `https://eye-today-web-production.up.railway.app/**`
   - `http://127.0.0.1:3000/auth/callback` (local dev against the hosted project)
2. **Emails → Invite user**: replace the link with the one in `supabase/templates/invite.html`
   (`{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=invite&next=/contribute`).
   `/contribute` sends each role on: contributors stay, editors get a link to /admin, readers go to /account.
   The default template uses URL fragments, which the server-side callback cannot read.
3. **Sign In / Providers → Google** (optional): add the Google OAuth client ID and secret. In
   Google Cloud, the authorized redirect URI is `https://<project-ref>.supabase.co/auth/v1/callback`.
   Magic link works without this; until it is set, "Continue with Google" shows an error.
4. **Bootstrap the first admin**: sign in once, then run this in the SQL editor (as the table owner):
   `update public.profiles set role = 'admin' where id = (select id from auth.users where email = 'you@example.com');`

## Database

RLS checks (local stack; each file runs in one transaction and rolls back):

```bash
npx supabase db reset
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/0002_rls.sql
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/0003_cms.sql
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/0004_contributors.sql
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/0005_frontend.sql
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/0006_seo.sql
```

All schema changes go in new files under `supabase/migrations/`. Every table has RLS
enabled and forced, and new objects get no `anon`/`authenticated` privileges by default.
Visitors can read only `sections` and published articles. Signed-in users act through their own
session (RLS applies). The service role (`src/lib/supabase/admin.ts`, server-only) is used only to
send invites (admin users and approved applications) and by the scheduled-publish cron route.
