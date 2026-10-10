# Sprint 14 — Events calendar `FEATURE` (~2.5 h)

**Goal:** A community calendar of retreats, conferences, webinars and integration circles, submitted by organisers and checked by editors.

**Will work when done**
- Events with title, type (conference, retreat, webinar, integration circle, training, other), online/in-person, start/end with time zone, venue, country/city, organiser, price note, registration URL, image, description, optional link to a directory listing.
- Organiser submission (signed-in, Turnstile, rate limit) → editor approval queue in `/admin/events`.
- `/events` list + month calendar views, filters (type, country, online), past-events archive; `/events/[slug]` detail page.
- "Add to calendar": per-event `.ics`, Google Calendar link, and a site-wide `/events.ics` feed.
- `Event` JSON-LD; "Upcoming events" rail on the cover and on matching directory listings; events sitemap.
- Optional "Promoted" flag reusing the featured pattern (labelled, paid via Stripe price env var, off when unset).

**Won't change:** No ticketing or RSVPs.

**Definition of done:** Submit an event → editor approves → it appears in /events (list and calendar), on the cover rail and on its linked listing; the .ics downloads and imports correctly with the right time zone.

## How to run this sprint
1. This file is in the repo at `docs/sprints/sprint-14-events.md` — reference it with @ in Cursor rather than pasting.
2. **Step 1** — paste the Cursor pre-flight review into a new Cursor agent chat. No code is written. Send the verdict to Claude (Cowork) to check.
3. **Step 2** — run the (corrected) build prompt in Claude Code / Cursor agent.
4. **Step 3** — Cursor debug pass on the pushed branch.
5. **Step 4** — PR → Bugbot. Claude (Cowork) tests and applies any migration, then you merge, then Claude smoke-tests the live site.

---

## Step 1 — Cursor pre-flight review

```
CURSOR PRE-FLIGHT REVIEW — Sprint 14: Events calendar
DO NOT write or change any code. Review only.

Read: @docs/sprints/sprint-14-events.md and the current codebase on main.
Already live: Sprints 0–13 (+10.1, 10b, 13.1) and Sprint 15 (reader comments). Production DB migrations 0001–0015
are applied; check supabase/migrations for anything newer. The next free migration number is 0016.

Check and report on:
1. Dependencies — does everything this sprint assumes actually exist (tables, columns, enums, RLS helpers such as
   current_app_role(), components, lib modules, env vars, routes)? List anything missing or named differently.
2. Schema and RLS — conflicts with existing migrations, type mismatches, missing indexes, RLS gaps that could expose
   unapproved/draft rows or let a role do more than intended. Is the proposed migration number free?
3. Next.js 16 correctness — server/client boundaries, server actions, async params/cookies, proxy.ts, caching and
   revalidation, route collisions with /[section] (RESERVED_SECTION_SLUGS), env vars leaking to the client.
4. Library accuracy — packages and APIs named here are current; flag anything deprecated or wrongly named.
5. Security — auth on every server action and route, input sanitising, webhook signatures, rate limits,
   service-role key never in user-facing code, CSP (report-only today) origins for anything new.
6. Scope — ambiguous or contradictory items, anything missing from the definition of done, anything too big for
   one session (propose a split).
7. Likely bugs — the 5 things most likely to break, and how to prevent each.

Output:
- Verdict: GO / GO WITH CHANGES / BLOCKED
- Issues table: # | severity (blocker / high / low) | area | issue | recommended fix
- A corrected, complete Claude Code build prompt with your fixes applied
  (keep the session header, definition of done and branch: sprint-14-events).
```

---

## Step 2 — Claude Code build prompt

```
SPRINT 14 — Events calendar
SESSION HEADER — Eye Today
You are working on Eye Today — a Next.js 16 (App Router, TypeScript, Tailwind v4) news portal covering
ibogaine and the psychedelic community, on Supabase (Postgres/Auth/Storage), deployed on Railway.
Repo: GWLeith234/eye-today. Publisher: EvolveX360. Sprint docs live in docs/sprints/.
Read docs/sprints/sprint-14-events.md before starting.
Rules:
- Work only within this sprint's scope. Create the branch sprint-14-events from the latest main before changing anything.
- PUSH TO GITHUB OFTEN: git push -u origin sprint-14-events after the first commit and after every numbered task.
  Work that is not on GitHub is considered lost.
- DB changes go in supabase/migrations as NEW files using the next free number (check the folder; 0001–0015
  are applied to production and must never be edited). Every new table: site_id, created_at/updated_at with the
  set_updated_at trigger, RLS enabled AND forced, REVOKE ALL from anon/authenticated, then the minimum grants.
  Every new migration gets a matching supabase/tests/<number>_*.sql that runs in one transaction and rolls back.
- New first-path routes (e.g. /directory) must be added to RESERVED_SECTION_SLUGS in src/lib/public/reserved.ts,
  because /[section] catches top-level paths.
- Never commit secrets. New env vars go in .env.example with a comment. Never prefix server secrets with NEXT_PUBLIC_.
- Every new integration must be a no-op when its env vars are missing.
- Reuse what exists: src/lib/http/rate-limit.ts, Turnstile on public forms, src/lib/ai (Claude, prompts, claims check),
  the Stripe setup in src/lib/membership, the email provider in src/lib/email, src/components/public/*.
- Public pages that mention treatment carry the existing medical/legal disclaimer.
- Run npm run lint, npm run typecheck, npm test and npm run build before every push. Playwright must stay green.
- If the Cursor pre-flight review produced a corrected prompt, follow the corrected version.
- Finish by opening a PR, marking it Ready for review, and waiting for Bugbot. Do not merge.
- End by summarising what changed, files touched, migrations added, env vars a human must set, and how to verify.

1. Migration 0016_events.sql (0001–0015 are in production, including 0015_comments from Sprint 15):
   events table (fields in sprint file; status draft|pending|published|cancelled;
   starts_at/ends_at timestamptz + tz text; listing_id null FK; promoted_until null), event_submissions if you keep
   raw submissions separate. RLS (all tables RLS enabled AND forced; REVOKE ALL from anon/authenticated first):
   - anon: no table grants. Public pages read published events only through SECURITY DEFINER functions
     (events_list(filters, page), event_by_slug(slug), events_ics_feed(), upcoming_events(lim)) that return
     status = 'published' rows only and never return organiser contact or editor fields.
   - Authenticated organisers: select their own rows (organiser_id = auth.uid()) through a column grant that
     excludes editor-only fields (editor_note, reject_reason internals); insert only via a definer function
     submit_event(...) with a rate limit (e.g. 5 per day per user) that forces status = 'pending';
     no direct update/delete — they edit via resubmission.
   - Editors/admins (current_app_role() in ('editor','admin')): full select/insert/update/delete.
   - listing_id must reference a published directory listing (check in the definer function).
   - pgcrypto lives in the "extensions" schema on Supabase; qualify any digest()/gen_random_bytes() calls.
   - supabase/tests/0016_events.sql proves: anon cannot select pending/cancelled-hidden rows or organiser
     emails; an organiser cannot read another organiser's pending event; an organiser cannot publish their own.
2. Admin /admin/events: list, edit form (media library, TipTap description sanitised), approve/reject with reason,
   cancel (keeps the page with a 'Cancelled' banner).
3. Public /events (list default, ?view=calendar month grid, accessible table semantics), /events/[slug].
4. ICS: per-event route and /events.ics feed (RFC 5545, correct TZID/UTC, escaping). Google Calendar link.
5. Cover rail "Upcoming events" (next 4), listing page rail, Event JSON-LD, events sitemap, add 'events' to reserved slugs and nav.
6. Optional promoted events behind STRIPE_PRICE_PROMOTED_EVENT (no-op when unset), labelled "Promoted".
7. Tests: RLS SQL test, ICS unit test (time zones, escaping), Playwright submit → approve → visible.

Verify: the definition of done — Submit an event → editor approves → it appears in /events (list and calendar), on the cover rail and on its linked listing; the .ics downloads and imports correctly with the right time zone.
Branch: sprint-14-events
```

---

## Step 3 — Cursor debug pass

```
CURSOR DEBUG PASS — Sprint 14: Events calendar
Run after the build is pushed. Fix bugs only — do not add features or expand scope.

Read: @docs/sprints/sprint-14-events.md and the diff of branch sprint-14-events against main.

1. Run npm run lint, npm run typecheck, npm test, npm run build and the Playwright suite. Fix every failure.
2. Walk the definition of done and confirm each step works:
   Submit an event → editor approves → it appears in /events (list and calendar), on the cover rail and on its linked listing; the .ics downloads and imports correctly with the right time zone.
3. Hunt for: missing await / unhandled rejections, missing loading and error states, hydration mismatches,
   server actions without auth checks, RLS bypassed via the service role, unsanitised HTML, secrets in client
   bundles, console errors, N+1 queries, mobile layout breakage, accessibility regressions.
4. New migrations run cleanly on a fresh DB after the previous ones, and their supabase/tests file passes.
5. git push before you finish.

Output:
- Bugs found and fixes applied (file + one-line description each)
- Anything that needs a human decision
- Ready to merge: YES / NO
```

**Rollback:** git revert the merge commit. If a migration was applied, write a new migration that undoes it — never edit the applied one.
