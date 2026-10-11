-- supabase/tests/0023_ad_units.sql — house ads fill empty slots, paid creatives beat them, advertisers own
-- their campaigns under RLS, creative sizes are enforced, payment is idempotent, approval activates,
-- the sponsored listing serves a premium listing, and the breakdown reports by slot and page.
--
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/0023_ad_units.sql
--
-- One transaction, rolled back.

\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email) values
  ('d2300000-0000-4000-8000-0000000000e1', 'ads.editor@qa.test'),
  ('d2300000-0000-4000-8000-0000000000a1', 'ads.clinic@qa.test'),
  ('d2300000-0000-4000-8000-0000000000a2', 'ads.other@qa.test');
update public.profiles set role = 'editor' where id = 'd2300000-0000-4000-8000-0000000000e1';

-- Media the clinic uploads itself, under RLS: one right size, one wrong size. Paths outside its own
-- ads/<id>/ folder, and rows owned by someone else, are refused.
set local request.jwt.claims = '{"role": "authenticated", "sub": "d2300000-0000-4000-8000-0000000000a1"}';
set local role authenticated;
insert into public.media (id, site_id, storage_path, alt, width, height, owner_id) values
  ('d2300000-0000-4000-8000-000000000a01', '00000000-0000-4000-8000-000000000001', 'ads/d2300000-0000-4000-8000-0000000000a1/lb.png', 'Leaderboard', 728, 90, 'd2300000-0000-4000-8000-0000000000a1'),
  ('d2300000-0000-4000-8000-000000000a02', '00000000-0000-4000-8000-000000000001', 'ads/d2300000-0000-4000-8000-0000000000a1/wrong.png', 'Wrong', 700, 100, 'd2300000-0000-4000-8000-0000000000a1');
do $$ declare failed boolean := false; begin
  begin
    insert into public.media (site_id, storage_path, alt, width, height, owner_id)
    values ('00000000-0000-4000-8000-000000000001', 'seed/anything.png', 'Elsewhere', 728, 90, 'd2300000-0000-4000-8000-0000000000a1');
  exception when insufficient_privilege then failed := true; end;
  assert failed, 'an advertiser cannot register media outside ads/<own id>/';
  failed := false;
  begin
    insert into public.media (site_id, storage_path, alt, width, height, owner_id)
    values ('00000000-0000-4000-8000-000000000001', 'ads/d2300000-0000-4000-8000-0000000000a2/x.png', 'Theirs', 728, 90, 'd2300000-0000-4000-8000-0000000000a2');
  exception when insufficient_privilege then failed := true; end;
  assert failed, 'an advertiser cannot register media as someone else';
  assert (select count(*) from public.media where storage_path like 'ads/%') = 2, 'an advertiser reads their own uploads';
  assert (select count(*) from public.media where storage_path not like 'ads/%') = 0, 'an advertiser reads nothing else in media';
end $$;
insert into storage.objects (bucket_id, name, owner) values ('media', 'ads/d2300000-0000-4000-8000-0000000000a1/lb.png', 'd2300000-0000-4000-8000-0000000000a1');
do $$ declare failed boolean := false; begin
  begin
    insert into storage.objects (bucket_id, name, owner) values ('media', 'seed/x.png', 'd2300000-0000-4000-8000-0000000000a1');
  exception when insufficient_privilege then failed := true; end;
  assert failed, 'an advertiser cannot write outside ads/<own id>/ in the media bucket';
end $$;
reset role;

-- House ------------------------------------------------------------------------------------

set local request.jwt.claims = '{"role": "anon"}';
set local role anon;
do $$
declare r record;
begin
  select * into r from public.serve_ad('leaderboard', 'home');
  assert r.creative_id is not null and r.is_house, 'with no paid campaign the house ad serves';
  select * into r from public.serve_ad('mobile-banner', 'article');
  assert r.creative_id is not null and r.is_house, 'the mobile banner has a house ad';
  assert not exists (select 1 from public.serve_sponsored_listing()), 'no premium listing, no sponsored card';
end $$;
reset role;

-- Advertiser creates a campaign and uploads creatives ------------------------------------------

set local request.jwt.claims = '{"role": "authenticated", "sub": "d2300000-0000-4000-8000-0000000000a1"}';
set local role authenticated;
do $$
declare
  failed boolean := false;
  v_col text;
  v_slot uuid := (select id from public.ad_slots where key = 'leaderboard' and site_id = '00000000-0000-4000-8000-000000000001');
begin
  insert into public.ad_campaigns (id, site_id, advertiser_name, name, status, owner_id, months, click_url)
  values ('d2300000-0000-4000-8000-000000000c01', '00000000-0000-4000-8000-000000000001', 'QA Clinic', 'Spring', 'draft',
          'd2300000-0000-4000-8000-0000000000a1', 3, 'https://qa-clinic.test/');

  begin
    insert into public.ad_campaigns (site_id, advertiser_name, name, status, owner_id, is_house)
    values ('00000000-0000-4000-8000-000000000001', 'QA Clinic', 'Sneaky', 'active', 'd2300000-0000-4000-8000-0000000000a1', false);
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'an owner cannot create an active campaign';
  failed := false;

  -- Before any creative exists: an owner cannot pre-approve or weight one (RLS). Then the right size goes in
  -- as pending; a wrong size and a second creative for the same unit are refused by the trigger.
  begin
    insert into public.ad_creatives (site_id, campaign_id, slot_id, media_id, click_url, alt, status)
    values ('00000000-0000-4000-8000-000000000001', 'd2300000-0000-4000-8000-000000000c01', v_slot,
            'd2300000-0000-4000-8000-000000000a01', 'https://qa-clinic.test/', 'Pre-approved', 'approved');
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'an owner cannot approve their own creative';
  failed := false;
  begin
    insert into public.ad_creatives (site_id, campaign_id, slot_id, media_id, click_url, alt, status, weight)
    values ('00000000-0000-4000-8000-000000000001', 'd2300000-0000-4000-8000-000000000c01', v_slot,
            'd2300000-0000-4000-8000-000000000a01', 'https://qa-clinic.test/', 'Heavy', 'pending', 50);
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'an owner cannot weight their creative';
  failed := false;
  -- Right size goes in as pending; wrong size is refused.
  insert into public.ad_creatives (site_id, campaign_id, slot_id, media_id, click_url, alt, status)
  values ('00000000-0000-4000-8000-000000000001', 'd2300000-0000-4000-8000-000000000c01', v_slot,
          'd2300000-0000-4000-8000-000000000a01', 'https://qa-clinic.test/', 'Spring at QA Clinic', 'pending');
  begin
    insert into public.ad_creatives (site_id, campaign_id, slot_id, media_id, click_url, alt, status)
    values ('00000000-0000-4000-8000-000000000001', 'd2300000-0000-4000-8000-000000000c01', v_slot,
            'd2300000-0000-4000-8000-000000000a02', 'https://qa-clinic.test/', 'Wrong', 'pending');
  exception when check_violation then failed := true;
  end;
  assert failed, 'a creative must match the slot size';
  failed := false;
  begin
    insert into public.ad_creatives (site_id, campaign_id, slot_id, media_id, click_url, alt, status)
    values ('00000000-0000-4000-8000-000000000001', 'd2300000-0000-4000-8000-000000000c01', v_slot,
            'd2300000-0000-4000-8000-000000000a01', 'https://qa-clinic.test/', 'Second', 'pending');
  exception when unique_violation then failed := true;
  end;
  assert failed, 'an owner gets one creative per unit';
  failed := false;
  -- Names and the start date may change; payment, status and the window may not.
  update public.ad_campaigns set name = 'Spring 2', starts_at = now() - interval '1 day' where id = 'd2300000-0000-4000-8000-000000000c01';
  foreach v_col in array array[$x$status = 'pending'$x$, 'paid_at = now()', 'months = 12', $x$ends_at = now() + interval '5 years'$x$, 'is_house = true', 'amount_cents = 0'] loop
    begin
      execute format('update public.ad_campaigns set %s where id = %L', v_col, 'd2300000-0000-4000-8000-000000000c01');
    exception when insufficient_privilege then failed := true;
    end;
    assert failed, format('an owner cannot set %s', v_col);
    failed := false;
  end loop;
  assert (select count(*) from public.ad_campaigns) = 1, 'an owner sees only their own campaigns';
end $$;
reset role;

-- Another signed-in user sees nothing of it.
set local request.jwt.claims = '{"role": "authenticated", "sub": "d2300000-0000-4000-8000-0000000000a2"}';
set local role authenticated;
do $$ begin
  assert (select count(*) from public.ad_campaigns) = 0, 'other users see no campaigns';
  assert (select count(*) from public.ad_creatives) = 0, 'other users see no creatives';
end $$;
reset role;

-- Unpaid: nothing serves yet -----------------------------------------------------------------

set local request.jwt.claims = '{"role": "anon"}';
set local role anon;
do $$ declare r record; begin
  select * into r from public.serve_ad('leaderboard', 'home');
  assert r.is_house, 'an unpaid, unapproved campaign never serves';
end $$;
reset role;

-- Payment (service role, as the webhook) -------------------------------------------------------

set local role service_role;
do $$
declare g public.ad_campaigns;
begin
  assert public.apply_ad_payment('cs_test_1', 'd2300000-0000-4000-8000-000000000c01', 'd2300000-0000-4000-8000-0000000000a1', 3, 75000, 'usd') = 'pending', 'first payment -> pending';
  assert public.apply_ad_payment('cs_test_1', 'd2300000-0000-4000-8000-000000000c01', 'd2300000-0000-4000-8000-0000000000a1', 3, 75000, 'usd') = 'duplicate', 'same session twice -> duplicate';
  assert public.apply_ad_payment('cs_test_2', 'd2300000-0000-4000-8000-000000000c01', 'd2300000-0000-4000-8000-0000000000a1', 3, 75000, 'usd') = 'already_paid', 'a paid campaign is not paid again';
  assert public.apply_ad_payment('cs_test_3', 'd2300000-0000-4000-8000-000000000c01', 'd2300000-0000-4000-8000-0000000000a2', 3, 75000, 'usd') = 'no_campaign', 'someone else cannot pay for it';
  select * into g from public.ad_campaigns where id = 'd2300000-0000-4000-8000-000000000c01';
  assert g.status = 'pending' and g.paid_at is not null and g.ends_at = g.starts_at + interval '3 months', 'window is months from start';
end $$;
reset role;

-- Once paid, the owner can still rename but not move the start date.
set local request.jwt.claims = '{"role": "authenticated", "sub": "d2300000-0000-4000-8000-0000000000a1"}';
set local role authenticated;
do $$ declare failed boolean := false; begin
  update public.ad_campaigns set name = 'Spring 3' where id = 'd2300000-0000-4000-8000-000000000c01';
  begin
    update public.ad_campaigns set starts_at = now() + interval '1 year' where id = 'd2300000-0000-4000-8000-000000000c01';
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'a paid start date is fixed';
end $$;
reset role;

-- Still nothing serves: pending, not approved.
set local request.jwt.claims = '{"role": "anon"}';
set local role anon;
do $$ declare r record; begin
  select * into r from public.serve_ad('leaderboard', 'home');
  assert r.is_house, 'a paid but unapproved campaign does not serve';
end $$;
reset role;

-- Editor approves --------------------------------------------------------------------------------

set local request.jwt.claims = '{"role": "authenticated", "sub": "d2300000-0000-4000-8000-0000000000e1"}';
set local role authenticated;
select public.decide_ad_campaign('d2300000-0000-4000-8000-000000000c01', true, null);
do $$ begin
  assert (select status from public.ad_campaigns where id = 'd2300000-0000-4000-8000-000000000c01') = 'active', 'approved -> active';
  assert (select status from public.ad_creatives where campaign_id = 'd2300000-0000-4000-8000-000000000c01') = 'approved', 'creatives approved with it';
end $$;
reset role;

-- A non-editor cannot decide.
set local request.jwt.claims = '{"role": "authenticated", "sub": "d2300000-0000-4000-8000-0000000000a1"}';
set local role authenticated;
do $$ declare failed boolean := false; begin
  begin perform public.decide_ad_campaign('d2300000-0000-4000-8000-000000000c01', false, 'x');
  exception when insufficient_privilege then failed := true; end;
  assert failed, 'owners cannot approve or reject';
end $$;
reset role;

-- Paid beats house; events record page type ---------------------------------------------------

set local request.jwt.claims = '{"role": "anon"}';
set local role anon;
do $$
declare r record; n integer := 0; i integer;
begin
  for i in 1..20 loop
    select * into r from public.serve_ad('leaderboard', 'home');
    if not r.is_house then n := n + 1; end if;
  end loop;
  assert n = 20, format('the paid creative always beats the house ad, got %s/20', n);
  assert r.image_path = 'ads/d2300000-0000-4000-8000-0000000000a1/lb.png', 'the paid image serves';
  select * into r from public.serve_ad('bigbox-1', 'directory');
  assert r.is_house, 'a slot the campaign has no creative for still shows house';
  perform public.record_ad_event(r.creative_id, 'bigbox-1', 'impression', repeat('a', 64), 'directory');
  select * into r from public.serve_ad('leaderboard', 'home');
  perform public.record_ad_event(r.creative_id, 'leaderboard', 'impression', repeat('b', 64), 'home');
  perform public.record_ad_event(r.creative_id, 'leaderboard', 'click', repeat('b', 64), 'home');
  perform public.record_ad_event(r.creative_id, 'leaderboard', 'impression', repeat('c', 64), 'nonsense');
end $$;
reset role;

-- Owner reads their own events and breakdown; editor the same ----------------------------------

set local request.jwt.claims = '{"role": "authenticated", "sub": "d2300000-0000-4000-8000-0000000000a1"}';
set local role authenticated;
do $$ declare r record; begin
  select * into r from public.ad_campaign_breakdown('d2300000-0000-4000-8000-000000000c01');
  assert r.slot_key = 'leaderboard' and r.page_type = 'home' and r.impressions = 1 and r.clicks = 1, format('breakdown %s %s %s %s', r.slot_key, r.page_type, r.impressions, r.clicks);
  assert (select count(*) from public.ad_events) = 2, 'owner sees only their events (the bad page_type one was dropped)';
end $$;
reset role;

-- Sponsored listing serves a premium listing --------------------------------------------------

insert into public.directory_listings (id, site_id, category_id, slug, name, country_code, city, description, status, verification_level, verification_note) values
  ('d2300000-0000-4000-8000-000000000b01', '00000000-0000-4000-8000-000000000001',
   (select id from public.directory_categories where slug = 'treatment-clinic' limit 1),
   'qa-premium', 'QA Premium Clinic', 'MX', 'Cancún', 'Premium.', 'published', 'listed', 'test');
insert into public.listing_features (site_id, listing_id, stripe_subscription_id, status, current_period_end) values
  ('00000000-0000-4000-8000-000000000001', 'd2300000-0000-4000-8000-000000000b01', 'sub_qa', 'active', now() + interval '300 days');

set local request.jwt.claims = '{"role": "anon"}';
set local role anon;
do $$ declare r public.directory_card; begin
  select * into r from public.serve_sponsored_listing();
  assert r.slug = 'qa-premium' and r.featured, 'the premium listing is the sponsored card';
end $$;
reset role;

rollback;
