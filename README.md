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
npm run typecheck   # next typegen && tsc --noEmit
npm run build
```

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
   (`{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=invite&next=/account`).
   The default template uses URL fragments, which the server-side callback cannot read.
3. **Sign In / Providers → Google** (optional): add the Google OAuth client ID and secret. In
   Google Cloud, the authorized redirect URI is `https://<project-ref>.supabase.co/auth/v1/callback`.
   Magic link works without this; until it is set, "Continue with Google" shows an error.
4. **Bootstrap the first admin**: sign in once, then run this in the SQL editor (as the table owner):
   `update public.profiles set role = 'admin' where id = (select id from auth.users where email = 'you@example.com');`

## Database

RLS checks for migration 0002:

```bash
npx supabase db reset
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/0002_rls.sql
```

All schema changes go in new files under `supabase/migrations/`. Every table has RLS
enabled and forced, and new objects get no `anon`/`authenticated` privileges by default.
Visitors can read only `sections` and published articles. Signed-in users act through their own
session (RLS applies). The service role (`src/lib/supabase/admin.ts`, server-only) is used only to
send invites.
