-- supabase/tests/0026_iab_ad_units.sql — every unit is an IAB size and the half page serves a house creative.
--
--   npx supabase db reset
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/0026_iab_ad_units.sql
--
-- One transaction, rolled back.

\set ON_ERROR_STOP on
begin;

do $$
declare
  bad integer;
begin
  select count(*) into bad
    from public.ad_slots s
   where s.site_id = '00000000-0000-4000-8000-000000000001'
     and s.key <> 'skin'  -- the skin (0029) is the wallpaper behind the page, not an IAB unit
     and (s.width, s.height) not in ((970, 250), (728, 90), (320, 50), (300, 250), (300, 600));
  assert bad = 0, bad || ' slot(s) are not an IAB size';
  assert (select (width, height) from public.ad_slots where site_id = '00000000-0000-4000-8000-000000000001' and key = 'in-river') = (728, 90), 'in-river is the in-feed leaderboard';
  assert (select (width, height) from public.ad_slots where site_id = '00000000-0000-4000-8000-000000000001' and key = 'in-article') = (300, 250), 'in-article is a medium rectangle';
  assert exists (select 1 from public.ad_slots where site_id = '00000000-0000-4000-8000-000000000001' and key = 'half-page' and width = 300 and height = 600 and is_active), 'half page exists';
end $$;
\echo 'ok  iab sizes'

set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
do $$
declare
  served record;
begin
  select * into served from public.serve_ad('half-page', 'home');
  assert served.creative_id is not null and served.is_house, 'the half page serves the house creative';
  assert served.html like '%theeye.today/tracker%', 'the house half page points at the tracker';
end $$;
reset role;
\echo 'ok  half page serves'

rollback;
