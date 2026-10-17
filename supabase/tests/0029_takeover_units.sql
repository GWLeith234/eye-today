-- supabase/tests/0029_takeover_units.sql — the billboard and skin exist, the billboard serves house, the skin stays empty.
--
--   npx supabase db reset
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/0029_takeover_units.sql
--
-- One transaction, rolled back.

\set ON_ERROR_STOP on
begin;

do $$
begin
  assert (select (width, height) from public.ad_slots where site_id = '00000000-0000-4000-8000-000000000001' and key = 'billboard') = (970, 250), 'billboard is 970×250';
  assert (select (width, height) from public.ad_slots where site_id = '00000000-0000-4000-8000-000000000001' and key = 'skin') = (1920, 1400), 'skin is 1920×1400';
  assert (select count(*) from public.ad_slots where site_id = '00000000-0000-4000-8000-000000000001' and is_active) = 9, 'nine active units';
end $$;
\echo 'ok  takeover slots'

set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
do $$
declare
  served record;
begin
  select * into served from public.serve_ad('billboard', 'home');
  assert served.creative_id is not null and served.is_house, 'the billboard serves the house creative';
  assert served.html like '%house-ads/billboard-970x250.png%', 'the house billboard is the rendered artwork';
  assert not exists (select 1 from public.serve_ad('skin', 'home')), 'the skin has no house creative';
end $$;
reset role;
\echo 'ok  billboard serves, skin empty'

rollback;
