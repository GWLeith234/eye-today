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
```

All schema changes go in new files under `supabase/migrations/`. Every table has RLS
enabled and forced, and new objects get no `anon`/`authenticated` privileges by default.
Visitors can read only `sections` and published articles. Signed-in users act through their own
session (RLS applies). The service role (`src/lib/supabase/admin.ts`, server-only) is used only to
send invites (admin users and approved applications) and by the scheduled-publish cron route.
