# Sprint 14 — Final build prompt (approved)

Pre-flight: Cursor verdict GO WITH CHANGES (2026-10-10). Claude review added six fixes, marked
"CLAUDE REVIEW ADDITION". Paste the block below into a new Cursor Agent chat, or reference this file with @.

```
SPRINT 14 — Events calendar
SESSION HEADER — Eye Today
You are working on Eye Today — a Next.js 16 (App Router, TypeScript, Tailwind v4) news portal covering
ibogaine and the psychedelic community, on Supabase (Postgres/Auth/Storage), deployed on Railway.
Repo: GWLeith234/eye-today. Publisher: EvolveX360. Sprint docs live in docs/sprints/.
Read docs/sprints/sprint-14-events.md before starting. Follow THIS prompt where it differs from the
draft in that file. The Cursor pre-flight verdict was GO WITH CHANGES; Claude's review added the
"CLAUDE REVIEW ADDITIONS" marked below — they override anything they contradict.
Rules:
- Work only within this sprint's scope. Create the branch sprint-14-events from the latest main before changing anything.
- PUSH TO GITHUB OFTEN: git push -u origin sprint-14-events after the first commit and after every numbered task.
  Work that is not on GitHub is considered lost.
- DB changes go in supabase/migrations as NEW files using the next free number (check the folder; 0001–0015
  are applied to production and must never be edited). Next file is supabase/migrations/0016_events.sql.
  Every new table: site_id, created_at/updated_at with the set_updated_at trigger, RLS enabled AND forced,
  REVOKE ALL from anon/authenticated, then the minimum grants.
  Every new migration gets a matching supabase/tests/0016_events.sql that runs in one transaction and rolls back,
  using the same set local role / request.jwt.claims style as supabase/tests/0015_comments.sql.
- New first-path routes must be added to RESERVED_SECTION_SLUGS in src/lib/public/reserved.ts,
  because /[section] and src/proxy.ts both treat an unreserved first segment as a section. Add "events"
  before creating the pages. proxy.ts redirects /<unreserved>/<slug> via article_slug_redirect.
- Never commit secrets. Do not add env vars in this sprint. Do not prefix anything with NEXT_PUBLIC_.
- Do not call the claims assistant, send email, or touch Stripe. Promoted is an editor timestamp only.
- Reuse: src/lib/http/rate-limit.ts, src/lib/http/turnstile.ts, src/app/(public)/write-for-us/turnstile-widget.tsx,
  renderArticleHtml / sanitizeArticleHtml, getEditorContext, requireArea, createAnonClient, mediaUrl,
  countryName, slugify / SLUG_RE, MEDICAL_DISCLAIMER, parsePage.
- Public event pages carry MEDICAL_DISCLAIMER in an element with role="note", same words as DirectoryFrame.
- Next.js 16, matching this repo: pages take PageProps<"/events"> and await params and searchParams.
  cookies() and headers() are async. Do not add middleware.ts. Route handlers live under src/app/(public)/
  so the public layout wraps pages. A route.ts does not render that layout.
- Zod 4, as already used here: z.uuid(), z.email(). Not z.string().uuid().
- Run npm run lint, npm run typecheck, npm test and npm run build before every push. Playwright must stay green.
- Finish by opening a PR, marking it Ready for review, and waiting for Bugbot. Do not merge.
- End by summarising what changed, files touched, migrations added, env vars a human must set (none), and how to verify.

Out of scope: ticketing, RSVPs, a second submissions table, organiser file upload, Stripe checkout,
STRIPE_PRICE_PROMOTED_EVENT, webhook changes, new CSP origins, createAdminClient() on these paths.

Definition of done: Submit an event → editor approves → it appears in /events (list and calendar),
on the cover rail and on its linked listing; the .ics downloads and imports correctly with the right time zone.
Branch: sprint-14-events

1. Migration 0016_events.sql

   One table, public.events. No event_submissions.

   Columns:
   - id uuid primary key default gen_random_uuid()
   - site_id uuid not null references public.sites(id) on delete cascade
   - slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
   - title text not null check (char_length(btrim(title)) between 1 and 160)
   - event_type text not null check (event_type in
     ('conference','retreat','webinar','integration_circle','training','other'))
   - attendance text not null check (attendance in ('online','in_person'))
   - starts_at timestamptz not null
   - ends_at timestamptz not null check (ends_at > starts_at)
   - tz text not null  -- IANA name, validated against pg_timezone_names
   - venue text check (venue is null or char_length(venue) <= 200)
   - country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$')
   - city text check (city is null or char_length(city) <= 80)
   - organiser_name text not null check (char_length(btrim(organiser_name)) between 1 and 160)
   - organiser_id uuid not null references public.profiles(id) on delete cascade
     (CLAUDE REVIEW ADDITION: cascade, matching comments in 0015, so deleting a user is never blocked)
   - contact_email text not null  -- private; never returned by a public RPC
   - price_note text not null default '' check (char_length(price_note) <= 200 and price_note !~ '[<>]')
   - registration_url text check (registration_url is null or registration_url ~ '^https://[^[:space:]]+$')
   - image_media_id uuid references public.media(id) on delete set null
   - description_html text not null default ''
   - listing_id uuid references public.directory_listings(id) on delete set null
   - status text not null default 'pending'
     check (status in ('draft','pending','rejected','published','cancelled'))
   - reject_reason text check (reject_reason is null or char_length(reject_reason) <= 500)
   - editor_note text check (editor_note is null or char_length(editor_note) <= 500)
   - promoted_until timestamptz
   - reviewed_by uuid references public.profiles(id) on delete set null
   - published_at timestamptz
   - created_at timestamptz not null default now()
   - updated_at timestamptz not null default now()
   - unique (site_id, slug)
   - in_person rows require country_code (check attendance = 'online' or country_code is not null)
   - slug <> 'submit'

   Indexes: (site_id, status, starts_at), (organiser_id, created_at), (listing_id), (image_media_id).
   Trigger set_updated_at. search_path = '' on every function. Qualify pg_catalog and public.
   Do not schema-qualify least/greatest (see directory_search). pgcrypto is unnecessary here;
   do not call digest() or gen_random_bytes().

   RLS enabled and forced. REVOKE ALL on the table from anon, authenticated.
   Anon has no table privileges.
   GRANT SELECT (
     id, site_id, slug, title, event_type, attendance, starts_at, ends_at, tz, venue,
     country_code, city, organiser_name, organiser_id, price_note, registration_url,
     image_media_id, description_html, listing_id, status, reject_reason, promoted_until,
     published_at, created_at, updated_at
   ) TO authenticated.
   contact_email, editor_note and reviewed_by are not in that grant.
   GRANT INSERT, UPDATE, DELETE TO authenticated, and policies:
   - SELECT to authenticated using organiser_id = auth.uid() OR current_app_role() in ('editor','admin')
   - INSERT/UPDATE/DELETE to authenticated only with current_app_role() in ('editor','admin')
     (USING and WITH CHECK).
   No organiser insert/update/delete policy. Default deny covers them.

   BEFORE INSERT OR UPDATE trigger: when current_app_role() is not editor or admin,
   force status = 'pending', promoted_until = null, editor_note = null, reviewed_by = null,
   image_media_id = null, published_at = null. Reject a tz that is not in pg_timezone_names.
   Reject in_person without a country. This still runs for security definer functions.
   CLAUDE REVIEW ADDITION: exempt the table owner and service_role from the forcing branch, exactly like
   articles_lock_comments_flag in 0015_comments.sql (pg_has_role(current_user, relowner, 'MEMBER') or
   current_app_role() in ('editor','admin')). Otherwise migrations, tests and any service-role job that
   updates an event (current_app_role() is null there) would silently reset it to pending.
   The tz / country checks still apply to everyone.

   event_editor_note(p_id uuid) returns text, security definer, stable, search_path = ''.
   Returns editor_note only when current_app_role() in ('editor','admin').
   REVOKE ALL from public, anon, authenticated; GRANT EXECUTE to authenticated.

   Public RPCs, all security definer, stable, search_path = '', scoped to sites.slug = 'eyetoday'.
   REVOKE ALL from public, anon, authenticated, then GRANT EXECUTE to anon and authenticated:
   - events_list(p_type text, p_country text, p_online boolean, p_when text, p_page integer)
     returns the card columns below. status = 'published' only.
     p_when 'past' means ends_at < now(); anything else means ends_at >= now() (in progress stays listed).
     Optional type, upper(country), and attendance = 'online' when p_online is true.
     Page size 24, page clamped 1..100 the same way directory_search does. Order by
     (promoted_until is not null and promoted_until > now()) desc, starts_at asc, id.
   - event_by_slug(slug text) returns one row where status in ('published','cancelled').
     Include listing_slug and listing_name only when that directory listing is still status = 'published'.
     Include image storage_path and alt via media. Include promoted boolean
     (promoted_until is not null and promoted_until > now()). Never return contact_email,
     editor_note, reject_reason, organiser_id, or reviewed_by.
   - events_for_feed() returns published rows with ends_at >= now() - interval '1 day',
     limit 500, ordered by starts_at. Same public columns as the card, plus description stripped
     of tags is done in TypeScript, not SQL. No contact_email.
   - upcoming_events(lim integer) returns published rows with ends_at >= now(),
     limit clamped 1..8 (default 4), same order as events_list.
   - events_for_listing(p_listing uuid, lim integer) same filter, listing_id = p_listing,
     listing still published, limit clamped 1..8.
   - events_sitemap() returns slug, updated_at for status = 'published' only.
   - CLAUDE REVIEW ADDITION: events_in_month(p_month date) returns published rows that overlap that calendar
     month (starts_at < first day of next month AND ends_at >= first day of month, in UTC), limit 300,
     ordered by starts_at. The calendar view uses this, NOT events_list — events_list is paged (24) and
     upcoming-only, so a month grid built from it would be missing events. Past months must work too.
   - CLAUDE REVIEW ADDITION: id is not sensitive and is required for the ICS UID ({id}@eyetoday), so
     event_by_slug and events_for_feed must return it.

   Card/detail columns the RPCs may return: id, slug, title, event_type, attendance, starts_at, ends_at,
   tz, venue, country_code, city, organiser_name, price_note, registration_url, description_html,
   image_storage_path, image_alt, listing_slug, listing_name, promoted, status, updated_at.
   event_by_slug is the only one that returns status (so the page can show Cancelled).
   The others are published-only and omit status.

   submit_event(...) and resubmit_event(...) are security definer, search_path = ''.
   REVOKE ALL from public, anon, authenticated; GRANT EXECUTE to authenticated only.
   submit_event requires auth.uid(), copies email from auth.users, sets organiser_id = auth.uid(),
   status = 'pending', and ignores any attempt to set image, promoted_until, editor_note, or status.
   Slug from the title with slugify rules, plus a short suffix when (site, slug) collides; never 'submit'.
   listing_id, when not null, must be a published directory listing on the same site. A listing that is
   unpublished later stays as a dangling id; public RPCs hide the link. Do not use a published-only FK.
   Rate limit inside submit_event: 5 rows per organiser and 100 rows per site with created_at in the last
   24 hours; raise 'too many submissions' errcode P0001. CLAUDE REVIEW ADDITION: resubmit creates no row,
   so it is not counted in SQL; the server action rate-limits resubmit in memory (5 per 24h per user).
   resubmit_event updates only the caller's own row when status in ('pending','rejected'),
   then sets status = 'pending' and reject_reason = null.
   Description from submit/resubmit: max 4000 chars of plain text. CLAUDE REVIEW ADDITION: HTML-escape
   & < > " ' (do not just strip < >), turn blank-line-separated paragraphs into <p> elements, and store that.
   Public pages ALWAYS render description_html through sanitizeArticleHtml, whoever wrote it.
   Editors write description_html later through the app, after renderArticleHtml.

   supabase/tests/0016_events.sql proves:
   - anon select on public.events fails
   - anon event_by_slug and events_list do not return a pending, rejected, or draft row
   - anon event_by_slug returns a cancelled row; events_list, upcoming_events, events_for_feed
     and events_sitemap do not
   - those public functions do not contain the organiser email
   - organiser A cannot select organiser B's pending row
   - organiser A cannot update their row to published (and cannot set promoted_until)
   - submit_event on a draft or unpublished listing fails
   - the 6th submit in 24 hours raises P0001
   - events_in_month returns a published event in a past month and omits pending/cancelled ones
   - a service-role/owner update to a published event keeps it published (trigger exemption)

2. Admin /admin/events
   Add { href: "/admin/events", label: "Events" } to the NAV in src/app/admin/layout.tsx.
   Pages use requireArea("admin"). Actions use getEditorContext() and return immediately when it is null.
   Writes use that user-scoped client so RLS applies. Do not import createAdminClient.
   Queue lists pending first, then rejected, draft, published, cancelled.
   Editor form: the existing media <select> pattern from the article editor (pass media rows from the server),
   TipTap for the description. Persist description only by passing TipTap JSON through renderArticleHtml.
   Never store HTML posted by the client. Approve sets published, published_at = now(), reviewed_by = editor.
   Reject requires a reason (1..500) and sets rejected. Cancel sets cancelled and does not delete the row.
   Editors may set promoted_until. Clearing it removes the badge.
   After every successful write, revalidatePath for "/", "/events", `/events/${slug}`, the listing path
   `/directory/listing/${listingSlug}` when listing_id is set, and "/sitemap.xml".

3. Public pages, all under src/app/(public)/ so they get the site header and footer.
   /events — list is the default. Filters: type, country (ISO code), online=1, when=upcoming|past
   (default upcoming). ?view=calendar&month=YYYY-MM (default: current UTC month; validate the format and
   clamp to ±24 months, otherwise notFound) is built from events_in_month and is a server-rendered <table> with a caption,
   weekday <th scope="col">, and each day a <td>. No client clock and no "today" highlight, so the
   grid cannot hydrate differently. Published events only. Cancelled events are absent here.
   /events/submit — static segment, so it wins over [slug]. Signed-in users of any role
   (reader included); otherwise redirect to loginPath("/events/submit"). Turnstile widget.
   The server action fails closed when TURNSTILE_SECRET_KEY is missing (redirect ?error=unavailable),
   same as submitListing. Verify the token, then rateLimit(`event-submit:${userId}`, 5, 24h)
   and the SQL cap. Plain-text fields only. No file input.
   /events/[slug] — event_by_slug. notFound() for an unknown or non-public slug, and for slug "submit".
   Published page shows the facts, https registration link with rel="noopener noreferrer nofollow",
   image via mediaUrl when present, link to the directory listing when listing_slug is returned,
   and a "Promoted" badge (data-testid="promoted-badge") when promoted is true.
   Cancelled page stays up with a visible "Cancelled" banner and EventCancelled in the JSON-LD.
   /account/events — the caller's own rows (the authenticated select policy). A rejected or pending
   row can be resubmitted. Readers may open /account; requireArea("account") is enough.

   EventsFrame on list, calendar, detail and submit: links to /events, /events?view=calendar,
   /events/submit, and /events.ics, plus the medical disclaimer note.

   Masthead (desktop utility row and the mobile menu) gets an Events link beside Directory.
   Footer ABOUT gets { href: "/events", label: "Events" } beside Directory.
   In e2e/a11y/pages.spec.ts add "events" to staticPaths. In e2e/smoke/public.spec.ts and the a11y
   article probe, ignore hrefs whose first segment is events or directory so an event is not
   treated as a story.

4. ICS and Google Calendar.
   npm install @date-fns/tz (the date-fns 4 time-zone package). Do not add date-fns-tz, luxon, moment, or ical.js.
   src/lib/events/ics.ts builds one VCALENDAR (RFC 5545) from the feed rows, and one VEVENT for a single event.
   DTSTART and DTEND are UTC with a trailing Z, from the stored timestamptz. No TZID and no VTIMEZONE.
   Escape \, ; , and newlines. Fold at 75 octets. Stable UID `{id}@eyetoday`. PRODID and DTSTAMP required.
   src/lib/events/ics.test.ts: a title containing comma, semicolon, backslash and newline;
   2026-07-01 19:00 America/Vancouver → 20260702T020000Z;
   2026-01-15 19:00 America/Vancouver → 20260116T030000Z.
   The submit action interprets the posted local date, time and IANA zone with TZDate from @date-fns/tz
   and stores that instant. Display start and end with Intl.DateTimeFormat in the stored tz.
   Routes: src/app/(public)/events.ics/route.ts and src/app/(public)/events/[slug]/event.ics/route.ts.
   Content-Type text/calendar; charset=utf-8. Detail route returns 404 unless event_by_slug is published
   (a cancelled event has no feed file). The page links to that file and to
   https://calendar.google.com/calendar/render?action=TEMPLATE with dates=YYYYMMDDTHHmmssZ/YYYYMMDDTHHmmssZ
   built from the same instants. Google is an <a href>, not a script and not a form POST.

5. Cover, listing rail, JSON-LD, sitemap.
   Cover (src/app/(public)/page.tsx): "Upcoming events" rail, next 4 from upcoming_events, after the
   latest/most-read block and before the section rails. Also render it under the empty-state heading
   when there is no lead and no latest. Hide the rail when the list is empty.
   Directory listing page: events_for_listing(listing.id, 4) under the listing, heading "Upcoming events".
   JSON-LD @type Event on the detail page, escaped with the same "<" → \u003c replace as the listing page.
   startDate and endDate are ISO instants. eventAttendanceMode OnlineEventAttendanceMode or
   OfflineEventAttendanceMode. eventStatus EventScheduled, or EventCancelled when status is cancelled.
   location is VirtualLocation or a Place with addressLocality and addressCountry. organizer is an
   Organization with the public organiser_name only. image and url when we have them. No price, rating, or email.
   Sitemap: add "/events" to STATIC_PAGES and append events_sitemap() slugs as /events/{slug}.

6. Promoted. Editors set promoted_until in the admin form. The badge reads "Promoted".
   Do not create a checkout, a webhook branch, or an env var.

7. Tests. The SQL file from task 1. The ICS unit test from task 4.
   e2e/flows/events.spec.ts, skipped unless E2E_FULL is set, same shape as e2e/flows/directory.spec.ts:
   a signed-in reader submits with the Turnstile test widget, the anon REST select on events does not
   return the title, the editor approves at /admin/events, then the anonymous page sees the event on
   /events, on /events?view=calendar, on /, and on the linked listing, and GET /events/{slug}/event.ics
   returns text/calendar whose DTSTART is the UTC instant from task 4.

Verify the definition of done. The ICS check is the route body plus the unit test, not a manual Google import.
```
