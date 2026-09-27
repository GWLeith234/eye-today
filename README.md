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

## Checks

```bash
npm run lint
npm run typecheck   # next typegen && tsc --noEmit
npm run build
```

## Database

All schema changes go in new files under `supabase/migrations/`. Every table has RLS
enabled and forced; only `sections` and published articles are readable by `anon` /
`authenticated`. Writes go through the service role (`src/lib/supabase/admin.ts`,
server-only).
