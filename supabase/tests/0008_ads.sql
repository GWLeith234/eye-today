-- supabase/tests/0008_ads.sql — ad serving, events and access.
--
-- Run against a freshly reset local stack (plain psql, not `supabase test db`):
--   npx supabase db reset
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/0008_ads.sql
--
-- One transaction, rolled back.

\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('a8000000-0000-4000-8000-00000000000e', 'ads.editor@qa.test', '{"full_name": "Ada Editor"}'),
  ('a8000000-0000-4000-8000-00000000000c', 'ads.contrib@qa.test', '{"full_name": "Cy Contributor"}');
update public.profiles set role = 'editor' where id = 'a8000000-0000-4000-8000-00000000000e';
update public.profiles set role = 'contributor' where id = 'a8000000-0000-4000-8000-00000000000c';

do $$
begin
  assert (select count(*) from public.ad_slots where key in ('leaderboard', 'bigbox-1', 'bigbox-2', 'in-river', 'in-article')) >= 5,
    'the five slots are seeded';
end;
$$;

insert into public.ad_campaigns (id, site_id, advertiser_name, name, status, starts_at, ends_at, freq_cap_per_day) values
  ('a8000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-000000000001', 'Clinic Co', 'Spring', 'active',
   now() - interval '1 day', now() + interval '1 day', 3),
  ('a8000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-000000000001', 'Draft Co', 'Not live', 'draft', null, null, null),
  ('a8000000-0000-4000-8000-0000000000c3', '00000000-0000-4000-8000-000000000001', 'Old Co', 'Over', 'active',
   now() - interval '10 days', now() - interval '1 day', null);

-- A pending creative in bigbox-1 (html only), plus creatives that must never serve.
insert into public.ad_creatives (id, site_id, campaign_id, slot_id, click_url, alt, html, weight)
select 'a8000000-0000-4000-8000-0000000000d1', s.site_id, 'a8000000-0000-4000-8000-0000000000c1', s.id,
       'https://clinic.example/spring', 'Clinic', '<p>Spring clinic</p>', 1
  from public.ad_slots s where s.key = 'bigbox-1' limit 1;
insert into public.ad_creatives (id, site_id, campaign_id, slot_id, click_url, html, status)
select 'a8000000-0000-4000-8000-0000000000d2', s.site_id, 'a8000000-0000-4000-8000-0000000000c2', s.id, 'https://x.example', '<p>draft campaign</p>', 'approved'
  from public.ad_slots s where s.key = 'bigbox-1' limit 1;
insert into public.ad_creatives (id, site_id, campaign_id, slot_id, click_url, html, status)
select 'a8000000-0000-4000-8000-0000000000d3', s.site_id, 'a8000000-0000-4000-8000-0000000000c3', s.id, 'https://x.example', '<p>expired campaign</p>', 'approved'
  from public.ad_slots s where s.key = 'bigbox-1' limit 1;

do $$
begin
  assert (select status from public.ad_creatives where id = 'a8000000-0000-4000-8000-0000000000d1') = 'pending', 'new creatives are pending';
end;
$$;

-- As anon ------------------------------------------------------------------------------

set local request.jwt.claims = '{"role": "anon"}';
set local role anon;
do $$
declare
  failed boolean;
begin
  failed := false;
  begin perform 1 from public.ad_campaigns; exception when insufficient_privilege then failed := true; end;
  assert failed, 'anon cannot select ad_campaigns';
  failed := false;
  begin perform 1 from public.ad_events; exception when insufficient_privilege then failed := true; end;
  assert failed, 'anon cannot select ad_events';
  failed := false;
  begin perform 1 from public.ad_creatives; exception when insufficient_privilege then failed := true; end;
  assert failed, 'anon cannot select ad_creatives';
  failed := false;
  begin perform 1 from public.ad_event_hits; exception when insufficient_privilege then failed := true; end;
  assert failed, 'anon cannot select ad_event_hits';
  failed := false;
  begin perform 1 from public._servable_ads(); exception when insufficient_privilege then failed := true; end;
  assert failed, 'anon cannot call the internal servable list';

  assert (select count(*) from public.serve_ad('bigbox-1')) = 0, 'serve_ad returns nothing for a pending creative';
  assert (select count(*) from public.ad_click_target('a8000000-0000-4000-8000-0000000000d1')) = 0, 'no click target for a pending creative';
  perform public.record_ad_event('a8000000-0000-4000-8000-0000000000d1', 'bigbox-1', 'impression', repeat('a', 64));
end;
$$;
reset role;
do $$
begin
  assert (select count(*) from public.ad_events) = 0, 'record_ad_event does nothing for a pending creative';
end;
$$;
\echo 'ok  pending creative is invisible'

-- An editor approves it ------------------------------------------------------------------

set local request.jwt.claims = '{"role": "authenticated", "sub": "a8000000-0000-4000-8000-00000000000e"}';
set local role authenticated;
do $$
declare
  failed boolean;
begin
  assert (select count(*) from public.ad_campaigns) = 3, 'editor reads campaigns';
  insert into public.ad_campaigns (site_id, advertiser_name, name) values ('00000000-0000-4000-8000-000000000001', 'New Co', 'Editor made');
  update public.ad_creatives set status = 'approved' where id = 'a8000000-0000-4000-8000-0000000000d1';
  assert (select status from public.ad_creatives where id = 'a8000000-0000-4000-8000-0000000000d1') = 'approved', 'editor approves';

  failed := false;
  begin
    insert into public.ad_events (site_id, creative_id, slot_id, event_type)
    select site_id, id, slot_id, 'impression' from public.ad_creatives limit 1;
  exception when insufficient_privilege then failed := true; end;
  assert failed, 'editors cannot insert ad_events';
  failed := false;
  begin delete from public.ad_events; exception when insufficient_privilege then failed := true; end;
  assert failed, 'editors cannot delete ad_events';
end;
$$;
reset role;

-- A contributor has no access ------------------------------------------------------------

set local request.jwt.claims = '{"role": "authenticated", "sub": "a8000000-0000-4000-8000-00000000000c"}';
set local role authenticated;
do $$
begin
  assert (select count(*) from public.ad_campaigns) = 0, 'a contributor sees no campaigns';
  update public.ad_creatives set status = 'rejected' where id = 'a8000000-0000-4000-8000-0000000000d1';
end;
$$;
reset role;
do $$
begin
  assert (select status from public.ad_creatives where id = 'a8000000-0000-4000-8000-0000000000d1') = 'approved', 'a contributor cannot change a creative';
end;
$$;
\echo 'ok  editor and contributor'

-- After approval, anon is served that creative; drafts and expired campaigns never are ------

set local request.jwt.claims = '{"role": "anon"}';
set local role anon;
do $$
declare
  served record;
begin
  select * into served from public.serve_ad('bigbox-1');
  assert served.creative_id = 'a8000000-0000-4000-8000-0000000000d1', 'the approved creative is served';
  assert served.html = '<p>Spring clinic</p>', 'sanitized html comes back';
  assert served.freq_cap = 3, 'the frequency cap comes back';
  assert (select count(*) from public.serve_ad('bigbox-2')) = 0, 'and only in its own slot';
  assert (select count(*) from public.serve_ad('nope')) = 0, 'unknown slot';
  assert (select click_url from public.ad_click_target('a8000000-0000-4000-8000-0000000000d1')) = 'https://clinic.example/spring', 'click target';
  assert (select slot_key from public.ad_click_target('a8000000-0000-4000-8000-0000000000d1')) = 'bigbox-1', 'click target names the slot';
  assert (select count(*) from public.ad_click_target('a8000000-0000-4000-8000-0000000000d2')) = 0, 'draft campaign has no click target';

  -- record_ad_event: right slot only, both event types.
  perform public.record_ad_event('a8000000-0000-4000-8000-0000000000d1', 'bigbox-2', 'impression', repeat('b', 64));
  perform public.record_ad_event('a8000000-0000-4000-8000-0000000000d2', 'bigbox-1', 'impression', repeat('b', 64));
  perform public.record_ad_event('a8000000-0000-4000-8000-0000000000d3', 'bigbox-1', 'impression', repeat('b', 64));
  perform public.record_ad_event('a8000000-0000-4000-8000-0000000000d1', 'bigbox-1', 'impression', 'not-a-hash');
  perform public.record_ad_event('a8000000-0000-4000-8000-0000000000d1', 'bigbox-1', 'impression', repeat('b', 64));
  perform public.record_ad_event('a8000000-0000-4000-8000-0000000000d1', 'bigbox-1', 'click', repeat('b', 64));
end;
$$;
reset role;
do $$
begin
  assert (select count(*) from public.ad_events) = 2, 'only the right slot, a real creative and a valid hash record an event';
  assert (select count(*) from public.ad_events where event_type = 'impression') = 1, 'one impression';
  assert (select count(*) from public.ad_events where event_type = 'click') = 1, 'one click';
end;
$$;
\echo 'ok  approved creative serves and records'

-- The report function (as the editor) ------------------------------------------------------

set local request.jwt.claims = '{"role": "authenticated", "sub": "a8000000-0000-4000-8000-00000000000e"}';
set local role authenticated;
do $$
declare
  r record;
begin
  select * into r from public.ad_campaign_daily('a8000000-0000-4000-8000-0000000000c1');
  assert r.impressions = 1 and r.clicks = 1, format('daily counts: %s / %s', r.impressions, r.clicks);
end;
$$;
reset role;
set local request.jwt.claims = '{"role": "anon"}';
set local role anon;
do $$
declare
  failed boolean := false;
begin
  begin perform * from public.ad_campaign_daily('a8000000-0000-4000-8000-0000000000c1');
  exception when insufficient_privilege then failed := true; end;
  assert failed, 'anon cannot run the report function';
end;
$$;
reset role;

-- Rejected, paused, inactive: no longer served ------------------------------------------------

update public.ad_creatives set status = 'rejected' where id = 'a8000000-0000-4000-8000-0000000000d1';
set local role anon;
do $$
begin
  assert (select count(*) from public.serve_ad('bigbox-1')) = 0, 'a rejected creative never serves';
  perform public.record_ad_event('a8000000-0000-4000-8000-0000000000d1', 'bigbox-1', 'impression', repeat('c', 64));
end;
$$;
reset role;
update public.ad_creatives set status = 'approved' where id = 'a8000000-0000-4000-8000-0000000000d1';
update public.ad_campaigns set status = 'paused' where id = 'a8000000-0000-4000-8000-0000000000c1';
set local role anon;
do $$
begin
  assert (select count(*) from public.serve_ad('bigbox-1')) = 0, 'a paused campaign never serves';
end;
$$;
reset role;
update public.ad_campaigns set status = 'active' where id = 'a8000000-0000-4000-8000-0000000000c1';
update public.ad_creatives set is_active = false where id = 'a8000000-0000-4000-8000-0000000000d1';
set local role anon;
do $$
begin
  assert (select count(*) from public.serve_ad('bigbox-1')) = 0, 'an inactive creative never serves';
end;
$$;
reset role;
update public.ad_creatives set is_active = true where id = 'a8000000-0000-4000-8000-0000000000d1';
do $$
begin
  assert (select count(*) from public.ad_events) = 2, 'nothing was recorded for the rejected creative';
end;
$$;
\echo 'ok  rejected, paused and inactive'

-- Weighted choice: weight 1 vs 99 in a fresh slot ------------------------------------------------

insert into public.ad_creatives (id, site_id, campaign_id, slot_id, click_url, html, status, weight)
select 'a8000000-0000-4000-8000-0000000000e1', s.site_id, 'a8000000-0000-4000-8000-0000000000c1', s.id, 'https://a.example', '<p>light</p>', 'approved', 1
  from public.ad_slots s where s.key = 'in-article' limit 1;
insert into public.ad_creatives (id, site_id, campaign_id, slot_id, click_url, html, status, weight)
select 'a8000000-0000-4000-8000-0000000000e2', s.site_id, 'a8000000-0000-4000-8000-0000000000c1', s.id, 'https://b.example', '<p>heavy</p>', 'approved', 99
  from public.ad_slots s where s.key = 'in-article' limit 1;
set local role anon;
do $$
declare
  heavy integer := 0;
  i integer;
begin
  for i in 1..400 loop
    if (select creative_id from public.serve_ad('in-article')) = 'a8000000-0000-4000-8000-0000000000e2' then heavy := heavy + 1; end if;
  end loop;
  assert heavy between 360 and 400, format('the heavier creative wins most of the time: %s of 400', heavy);
end;
$$;
reset role;
\echo 'ok  weighting'

-- Rate limit: 30 calls a minute per ip hash --------------------------------------------------

set local role anon;
do $$
declare
  i integer;
begin
  for i in 1..40 loop
    perform public.record_ad_event('a8000000-0000-4000-8000-0000000000d1', 'bigbox-1', 'impression', repeat('f', 64));
  end loop;
end;
$$;
reset role;
do $$
begin
  assert (select count(*) from public.ad_events where event_type = 'impression') = 31,
    format('30 calls from one hash record, the rest do nothing: %s', (select count(*) from public.ad_events where event_type = 'impression'));
end;
$$;
\echo 'ok  rate limit'

-- Sponsor logo: readable only for a live sponsored article ---------------------------------------

insert into public.media (id, site_id, storage_path, alt) values
  ('a8000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-000000000001', 'sponsor-logo-live.png', null),
  ('a8000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-000000000001', 'sponsor-logo-draft.png', null);
insert into public.articles (id, site_id, section_id, slug, title, status, published_at, is_sponsored, sponsor_name, sponsor_logo_media_id) values
  ('a8000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101',
   'ads-live-sponsored', 'Live sponsored', 'published', now() - interval '1 hour', true, 'Clinic Co', 'a8000000-0000-4000-8000-0000000000f1'),
  ('a8000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101',
   'ads-draft-sponsored', 'Draft sponsored', 'draft', null, true, 'Clinic Co', 'a8000000-0000-4000-8000-0000000000f2');
set local role anon;
do $$
begin
  assert (select count(*) from public.media where id = 'a8000000-0000-4000-8000-0000000000f1') = 1, 'live sponsored logo is public';
  assert (select count(*) from public.media where id = 'a8000000-0000-4000-8000-0000000000f2') = 0, 'a draft sponsor logo is not';
  assert (select count(*) from public.media) = (select count(*) from public.media where id = 'a8000000-0000-4000-8000-0000000000f1'
      or id in (select hero_media_id from public.articles where hero_media_id is not null)), 'no general media read';
end;
$$;
reset role;
\echo 'ok  sponsor logos'

rollback;
\echo 'ALL 0008 ADS TESTS PASSED'
