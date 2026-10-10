-- supabase/tests/0016_events.sql — events: RLS, organiser writes, public reads, rate limit.
--
-- Run against a freshly reset local stack (plain psql, not `supabase test db`):
--   npx supabase db reset
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/0016_events.sql
--
-- One transaction, rolled back.

\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email) values
  ('d1600000-0000-4000-8000-0000000000e1', 'ev.editor@qa.test'),
  ('d1600000-0000-4000-8000-0000000000a1', 'ev.alice@qa.test'),
  ('d1600000-0000-4000-8000-0000000000b1', 'ev.bob@qa.test');
update public.profiles set role = 'editor' where id = 'd1600000-0000-4000-8000-0000000000e1';

insert into public.directory_listings (
  id, site_id, category_id, slug, name, country_code, city, description, status, verification_level, verification_note
) values
  ('d1600000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-000000000001',
   (select id from public.directory_categories where slug = 'treatment-clinic' and site_id = '00000000-0000-4000-8000-000000000001'),
   'ev-published-listing', 'Published Listing', 'MX', 'Tulum', 'Public.', 'published', 'listed', 'ok'),
  ('d1600000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-000000000001',
   (select id from public.directory_categories where slug = 'treatment-clinic' and site_id = '00000000-0000-4000-8000-000000000001'),
   'ev-draft-listing', 'Draft Listing', 'MX', 'Tulum', 'Hidden.', 'draft', 'listed', 'ok');

-- Owner inserts (tests) keep the status they are given.
insert into public.events (
  id, site_id, slug, title, event_type, attendance, starts_at, ends_at, tz, country_code, city,
  organiser_name, organiser_id, contact_email, status, listing_id, editor_note, description_html, created_at
) values
  ('d1600000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-000000000001', 'ev-published', 'Published Retreat',
   'retreat', 'in_person', now() + interval '10 days', now() + interval '12 days', 'America/Cancun', 'MX', 'Tulum',
   'Org A', 'd1600000-0000-4000-8000-0000000000a1', 'secret-a@qa.test', 'published',
   'd1600000-0000-4000-8000-0000000000c1', 'private note', '<p>Hello</p>', now() - interval '2 days'),
  ('d1600000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-000000000001', 'ev-pending', 'Pending Webinar',
   'webinar', 'online', now() + interval '5 days', now() + interval '5 days 2 hours', 'UTC', null, null,
   'Org B', 'd1600000-0000-4000-8000-0000000000b1', 'secret-b@qa.test', 'pending', null, null, '', now() - interval '2 days'),
  ('d1600000-0000-4000-8000-0000000000f3', '00000000-0000-4000-8000-000000000001', 'ev-rejected', 'Rejected Circle',
   'integration_circle', 'online', now() + interval '6 days', now() + interval '6 days 1 hour', 'UTC', null, null,
   'Org B', 'd1600000-0000-4000-8000-0000000000b1', 'secret-b@qa.test', 'rejected', null, null, '', now() - interval '2 days'),
  ('d1600000-0000-4000-8000-0000000000f4', '00000000-0000-4000-8000-000000000001', 'ev-draft', 'Draft Training',
   'training', 'online', now() + interval '7 days', now() + interval '7 days 1 hour', 'UTC', null, null,
   'Org B', 'd1600000-0000-4000-8000-0000000000b1', 'secret-b@qa.test', 'draft', null, null, '', now() - interval '2 days'),
  ('d1600000-0000-4000-8000-0000000000f5', '00000000-0000-4000-8000-000000000001', 'ev-cancelled', 'Cancelled Conference',
   'conference', 'online', now() + interval '8 days', now() + interval '9 days', 'UTC', null, null,
   'Org A', 'd1600000-0000-4000-8000-0000000000a1', 'secret-a@qa.test', 'cancelled', null, null, '', now() - interval '2 days'),
  ('d1600000-0000-4000-8000-0000000000f6', '00000000-0000-4000-8000-000000000001', 'ev-past', 'Past Webinar',
   'webinar', 'online', timestamptz '2025-03-10 18:00Z', timestamptz '2025-03-10 20:00Z', 'UTC', null, null,
   'Org A', 'd1600000-0000-4000-8000-0000000000a1', 'secret-a@qa.test', 'published', null, null, '', now() - interval '2 days');

do $$
declare
  failed boolean := false;
begin
  begin
    insert into public.events (site_id, slug, title, event_type, attendance, starts_at, ends_at, tz,
      organiser_name, organiser_id, contact_email)
    values ('00000000-0000-4000-8000-000000000001', 'bad-tz', 'Bad', 'other', 'online', now(), now() + interval '1 hour',
      'Mars/Olympus', 'X', 'd1600000-0000-4000-8000-0000000000a1', 'x@qa.test');
  exception when check_violation then failed := true;
  end;
  assert failed, 'an unknown time zone is rejected';

  failed := false;
  begin
    insert into public.events (site_id, slug, title, event_type, attendance, starts_at, ends_at, tz,
      organiser_name, organiser_id, contact_email)
    values ('00000000-0000-4000-8000-000000000001', 'no-country', 'Bad', 'retreat', 'in_person', now(), now() + interval '1 hour',
      'UTC', 'X', 'd1600000-0000-4000-8000-0000000000a1', 'x@qa.test');
  exception when check_violation then failed := true;
  end;
  assert failed, 'in-person without a country is rejected';

  failed := false;
  begin
    insert into public.events (site_id, slug, title, event_type, attendance, starts_at, ends_at, tz,
      organiser_name, organiser_id, contact_email)
    values ('00000000-0000-4000-8000-000000000001', 'submit', 'Bad', 'other', 'online', now(), now() + interval '1 hour',
      'UTC', 'X', 'd1600000-0000-4000-8000-0000000000a1', 'x@qa.test');
  exception when check_violation then failed := true;
  end;
  assert failed, 'the slug submit is reserved';

  -- Owner/service updates keep the status (trigger exemption).
  update public.events set title = 'Published Retreat' where id = 'd1600000-0000-4000-8000-0000000000f1';
  assert (select status from public.events where id = 'd1600000-0000-4000-8000-0000000000f1') = 'published',
    'an owner update keeps a published event published';
end;
$$;

set local role service_role;
update public.events set city = 'Tulum' where id = 'd1600000-0000-4000-8000-0000000000f1';
reset role;
do $$
begin
  assert (select status from public.events where id = 'd1600000-0000-4000-8000-0000000000f1') = 'published',
    'a service-role update keeps a published event published';
end;
$$;
\echo 'ok  table rules'

-- Anon ------------------------------------------------------------------------------------

set local request.jwt.claims = '{"role": "anon"}';
set local role anon;

do $$
declare
  failed boolean := false;
  blob text;
begin
  begin
    perform 1 from public.events;
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'anon cannot select events';

  assert (select count(*) from public.event_by_slug('ev-published')) = 1, 'published is readable by slug';
  assert (select count(*) from public.event_by_slug('ev-pending')) = 0, 'pending is not readable by slug';
  assert (select count(*) from public.event_by_slug('ev-rejected')) = 0, 'rejected is not readable by slug';
  assert (select count(*) from public.event_by_slug('ev-draft')) = 0, 'draft is not readable by slug';
  assert (select status from public.event_by_slug('ev-cancelled')) = 'cancelled', 'cancelled keeps its page';
  assert (select listing_slug from public.event_by_slug('ev-published')) = 'ev-published-listing',
    'a published listing is linked';
  assert (select id from public.event_by_slug('ev-published')) = 'd1600000-0000-4000-8000-0000000000f1',
    'event_by_slug returns the id for the ICS UID';

  assert (select count(*) from public.events_list(null, null, null, 'upcoming', 1)) = 1, 'upcoming list has the published event only';
  assert (select slug from public.events_list(null, null, null, 'upcoming', 1)) = 'ev-published', 'upcoming list row';
  assert (select count(*) from public.events_list(null, null, null, 'past', 1)) = 1, 'past list has the past event';
  assert (select events_list_count(null, null, null, 'upcoming')) = 1, 'count matches';
  assert (select count(*) from public.events_list('webinar', null, null, 'upcoming', 1)) = 0, 'type filter';
  assert (select count(*) from public.events_list(null, 'mx', null, 'upcoming', 1)) = 1, 'country filter is case-insensitive';
  assert (select count(*) from public.events_list(null, null, true, 'upcoming', 1)) = 0, 'online filter';
  assert (select count(*) from public.upcoming_events(4) where slug = 'ev-cancelled') = 0, 'cancelled not on the cover';
  assert (select count(*) from public.events_for_feed() where slug in ('ev-cancelled', 'ev-pending')) = 0, 'feed is published only';
  assert (select count(*) from public.events_sitemap() where slug in ('ev-cancelled', 'ev-pending', 'ev-draft')) = 0,
    'sitemap is published only';
  assert (select count(*) from public.events_for_listing('d1600000-0000-4000-8000-0000000000c1', 4)) = 1, 'listing rail';
  assert (select count(*) from public.events_in_month(date '2025-03-01')) = 1, 'a past month shows its event';
  assert (select count(*) from public.events_in_month(date '2025-04-01')) = 0, 'it does not leak into the next month';
  assert (select count(*) from public.events_in_month(date '2025-02-01')) = 0, 'or the previous one';
  assert (select count(*) from public.events_in_month((now() + interval '5 days')::date)
           where slug in ('ev-pending', 'ev-cancelled')) = 0, 'month view is published only';

  select string_agg(t::text, ' ') into blob from (
    select row(e.*)::text as t from public.event_by_slug('ev-published') e
    union all select row(e.*)::text from public.events_list(null, null, null, 'upcoming', 1) e
    union all select row(e.*)::text from public.events_for_feed() e
    union all select row(e.*)::text from public.upcoming_events(8) e
  ) x;
  assert position('secret-a@qa.test' in blob) = 0, 'public functions never return the organiser email';
  assert position('private note' in blob) = 0, 'public functions never return the editor note';

  failed := false;
  begin
    perform public.submit_event('X', 'other', 'online', now() + interval '1 day', now() + interval '2 days', 'UTC',
      null, null, null, 'Org', null, null, null, null);
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'anon cannot submit';
end;
$$;
reset role;
\echo 'ok  anon'

-- Organisers ------------------------------------------------------------------------------

set local request.jwt.claims = '{"role": "authenticated", "sub": "d1600000-0000-4000-8000-0000000000a1"}';
set local role authenticated;

do $$
declare
  failed boolean := false;
  new_slug text;
begin
  assert (select count(*) from public.events where id = 'd1600000-0000-4000-8000-0000000000f2') = 0,
    'organiser A cannot read organiser B''s pending event';
  assert (select count(*) from public.events where organiser_id = 'd1600000-0000-4000-8000-0000000000a1') = 3,
    'organiser A reads their own events';

  begin
    perform contact_email from public.events where id = 'd1600000-0000-4000-8000-0000000000f1';
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'organisers cannot read contact_email';

  failed := false;
  begin
    perform editor_note from public.events where id = 'd1600000-0000-4000-8000-0000000000f1';
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'organisers cannot read editor_note';
  assert public.event_editor_note('d1600000-0000-4000-8000-0000000000f1') is null, 'the note function hides it from organisers';

  update public.events set status = 'published', promoted_until = now() + interval '30 days'
   where id = 'd1600000-0000-4000-8000-0000000000f5';
  assert (select status from public.events where id = 'd1600000-0000-4000-8000-0000000000f5') = 'cancelled',
    'an organiser cannot publish or promote their own row';

  new_slug := public.submit_event(
    'My <b>Ceremony</b> & Circle', 'integration_circle', 'in_person',
    timestamptz '2027-07-02 02:00Z', timestamptz '2027-07-02 04:00Z', 'America/Vancouver',
    'Hall', 'ca', 'Vancouver', 'Alice <Org>', 'By donation', 'https://example.com/register',
    E'Line one & <script>alert(1)</script>\n\nSecond para', 'ev-published-listing'
  );
  assert new_slug = 'my-b-ceremony-b-circle', 'slug comes from the title: ' || new_slug;
  assert (select status from public.events where slug = new_slug) = 'pending', 'submissions are pending';
  assert (select country_code from public.events where slug = new_slug) = 'CA', 'country is uppercased';
  assert (select organiser_name from public.events where slug = new_slug) = 'Alice Org', 'angle brackets are removed';
  assert (select description_html from public.events where slug = new_slug)
         = '<p>Line one &amp; &lt;script&gt;alert(1)&lt;/script&gt;</p><p>Second para</p>',
    'description is escaped into paragraphs';
  assert (select listing_id from public.events where slug = new_slug) = 'd1600000-0000-4000-8000-0000000000c1',
    'a published listing is linked';

  -- Same title again gets a suffix.
  assert public.submit_event('My <b>Ceremony</b> & Circle', 'other', 'online',
    now() + interval '1 day', now() + interval '1 day 1 hour', 'UTC', null, null, null, 'Alice', null, null, null, null)
    like 'my-b-ceremony-b-circle-%', 'a colliding slug gets a suffix';

  failed := false;
  begin
    perform public.submit_event('Draft link', 'other', 'online', now() + interval '1 day', now() + interval '2 days',
      'UTC', null, null, null, 'Alice', null, null, null, 'ev-draft-listing');
  exception when check_violation then failed := true;
  end;
  assert failed, 'a draft listing cannot be linked';

  failed := false;
  begin
    perform public.submit_event('Bad url', 'other', 'online', now() + interval '1 day', now() + interval '2 days',
      'UTC', null, null, null, 'Alice', null, 'javascript:alert(1)', null, null);
  exception when check_violation then failed := true;
  end;
  assert failed, 'a non-https registration URL is rejected';

  failed := false;
  begin
    perform public.resubmit_event('d1600000-0000-4000-8000-0000000000f3', 'Hijack', 'other', 'online',
      now() + interval '1 day', now() + interval '2 days', 'UTC', null, null, null, 'Alice', null, null, null, null);
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'an organiser cannot resubmit someone else''s event';
end;
$$;

-- Seeded rows are two days old. Alice has 2 submissions today; three more succeed, the 6th is refused.
select public.submit_event('Rate ' || g, 'other', 'online', now() + interval '1 day', now() + interval '2 days',
  'UTC', null, null, null, 'Alice', null, null, null, null)
  from generate_series(1, 3) g;

do $$
declare
  failed boolean := false;
begin
  begin
    perform public.submit_event('Rate 6', 'other', 'online', now() + interval '1 day', now() + interval '2 days',
      'UTC', null, null, null, 'Alice', null, null, null, null);
  exception when sqlstate 'P0001' then failed := true;
  end;
  assert failed, 'the 6th submission in 24 hours is refused';
end;
$$;
reset role;

do $$
begin
  assert (select count(*) from public.events
           where organiser_id = 'd1600000-0000-4000-8000-0000000000a1' and created_at > now() - interval '1 day') = 5,
    'the cap stopped Alice at five submissions';
end;
$$;
\echo 'ok  organisers'

-- Bob resubmits his rejected event --------------------------------------------------------

set local request.jwt.claims = '{"role": "authenticated", "sub": "d1600000-0000-4000-8000-0000000000b1"}';
set local role authenticated;
select public.resubmit_event('d1600000-0000-4000-8000-0000000000f3', 'Rejected Circle, fixed', 'integration_circle', 'online',
  now() + interval '6 days', now() + interval '6 days 1 hour', 'UTC', null, null, null, 'Org B', null, null, 'Better now', null);
do $$
begin
  assert (select status from public.events where id = 'd1600000-0000-4000-8000-0000000000f3') = 'pending', 'resubmit sets pending';
  assert (select reject_reason from public.events where id = 'd1600000-0000-4000-8000-0000000000f3') is null, 'resubmit clears the reason';
end;
$$;
reset role;
\echo 'ok  resubmit'

-- Editors ---------------------------------------------------------------------------------

set local request.jwt.claims = '{"role": "authenticated", "sub": "d1600000-0000-4000-8000-0000000000e1"}';
set local role authenticated;
update public.events set status = 'published', published_at = now(), promoted_until = now() + interval '7 days',
  reviewed_by = 'd1600000-0000-4000-8000-0000000000e1'
 where id = 'd1600000-0000-4000-8000-0000000000f2';
do $$
begin
  assert (select status from public.events where id = 'd1600000-0000-4000-8000-0000000000f2') = 'published', 'editors publish';
  assert public.event_editor_note('d1600000-0000-4000-8000-0000000000f1') = 'private note', 'editors read the note';
  assert (select promoted from public.event_by_slug('ev-pending')) = true, 'promoted shows once published';
  assert (select slug from public.upcoming_events(1)) = 'ev-pending', 'promoted sorts first';
end;
$$;
reset role;
\echo 'ok  editors'

rollback;
