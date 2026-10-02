-- supabase/tests/0009_membership.sql — tiers, memberships, role sync.
--
-- Run against a freshly reset local stack (plain psql, not `supabase test db`):
--   npx supabase db reset
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/0009_membership.sql
--
-- One transaction, rolled back.

\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('a9000000-0000-4000-8000-000000000001', 'reader.one@qa.test', '{"full_name": "Rae Reader"}'),
  ('a9000000-0000-4000-8000-000000000002', 'reader.two@qa.test', '{"full_name": "Rob Reader"}'),
  ('a9000000-0000-4000-8000-000000000003', 'editor@qa.test', '{"full_name": "Eda Editor"}'),
  ('a9000000-0000-4000-8000-000000000004', 'contrib@qa.test', '{"full_name": "Cy Contributor"}');
update public.profiles set role = 'editor' where id = 'a9000000-0000-4000-8000-000000000003';
update public.profiles set role = 'contributor' where id = 'a9000000-0000-4000-8000-000000000004';

do $$
begin
  assert (select count(*) from public.membership_tiers where slug in ('monthly', 'annual', 'once')) >= 3, 'three tiers seeded';
  assert (select interval from public.membership_tiers where slug = 'once' limit 1) = 'once', 'the one-time tier uses the once interval';
  assert (select interval from public.membership_tiers where slug = 'annual' limit 1) = 'year', 'annual is a year';
  assert exists (select 1 from public.newsletter_lists where slug = 'supporters'), 'supporters list seeded';
  assert (select stripe_price_id from public.membership_tiers where slug = 'monthly' limit 1) is null, 'price ids start empty';
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
  begin perform 1 from public.memberships; exception when insufficient_privilege then failed := true; end;
  assert failed, 'anon cannot select memberships';
  failed := false;
  begin perform 1 from public.stripe_events; exception when insufficient_privilege then failed := true; end;
  assert failed, 'anon cannot select stripe_events';
  failed := false;
  begin perform stripe_price_id from public.membership_tiers; exception when insufficient_privilege then failed := true; end;
  assert failed, 'anon cannot read stripe_price_id';
  assert (select count(*) from public.membership_tiers where slug = 'monthly') >= 1, 'anon can read tier names and prices';
  failed := false;
  begin perform public.attach_stripe_customer('cus_anonanonanon'); exception when insufficient_privilege then failed := true; end;
  assert failed, 'anon cannot attach a customer';
end;
$$;
reset role;
\echo 'ok  anon'

-- Role sync -------------------------------------------------------------------------------

insert into public.memberships (site_id, profile_id, tier_id, status, current_period_end)
select t.site_id, 'a9000000-0000-4000-8000-000000000001', t.id, 'active', now() + interval '20 days'
  from public.membership_tiers t where t.slug = 'monthly' limit 1;
insert into public.memberships (site_id, profile_id, tier_id, status, current_period_end)
select t.site_id, 'a9000000-0000-4000-8000-000000000003', t.id, 'canceled', now() - interval '2 days'
  from public.membership_tiers t where t.slug = 'monthly' limit 1;

do $$
begin
  assert public.sync_supporter_role('a9000000-0000-4000-8000-000000000001') = 'supporter', 'reader with an active membership -> supporter';
  assert (select role from public.profiles where id = 'a9000000-0000-4000-8000-000000000001') = 'supporter', 'and the row says so';
  assert public.sync_supporter_role('a9000000-0000-4000-8000-000000000001') = 'supporter', 'idempotent';

  -- Cancel at period end keeps status active, so nothing changes until the subscription ends.
  update public.memberships set current_period_end = now() + interval '1 day' where profile_id = 'a9000000-0000-4000-8000-000000000001';
  assert public.sync_supporter_role('a9000000-0000-4000-8000-000000000001') = 'supporter', 'active with a near period end is still a supporter';

  -- The subscription ends.
  update public.memberships set status = 'canceled', current_period_end = now() - interval '1 hour' where profile_id = 'a9000000-0000-4000-8000-000000000001';
  assert public.sync_supporter_role('a9000000-0000-4000-8000-000000000001') = 'reader', 'canceled and past -> reader';

  -- past_due: kept while the period runs, dropped after.
  update public.memberships set status = 'past_due', current_period_end = now() + interval '2 days' where profile_id = 'a9000000-0000-4000-8000-000000000001';
  assert public.sync_supporter_role('a9000000-0000-4000-8000-000000000001') = 'supporter', 'past_due inside its period -> supporter';
  update public.memberships set current_period_end = now() - interval '1 minute' where profile_id = 'a9000000-0000-4000-8000-000000000001';
  assert public.sync_supporter_role('a9000000-0000-4000-8000-000000000001') = 'reader', 'past_due after its period -> reader';
  update public.memberships set current_period_end = null where profile_id = 'a9000000-0000-4000-8000-000000000001';
  assert public.sync_supporter_role('a9000000-0000-4000-8000-000000000001') = 'supporter', 'past_due with no period end -> supporter';

  -- expired never counts
  update public.memberships set status = 'expired' where profile_id = 'a9000000-0000-4000-8000-000000000001';
  assert public.sync_supporter_role('a9000000-0000-4000-8000-000000000001') = 'reader', 'expired -> reader';

  assert public.sync_supporter_role('a9000000-0000-4000-8000-000000000003') = 'editor', 'an editor with a canceled membership stays an editor';
  update public.memberships set status = 'active' where profile_id = 'a9000000-0000-4000-8000-000000000003';
  assert public.sync_supporter_role('a9000000-0000-4000-8000-000000000003') = 'editor', 'an editor with an active membership stays an editor';

  insert into public.memberships (site_id, profile_id, tier_id, status)
  select t.site_id, 'a9000000-0000-4000-8000-000000000004', t.id, 'active' from public.membership_tiers t where t.slug = 'once' limit 1;
  assert public.sync_supporter_role('a9000000-0000-4000-8000-000000000004') = 'contributor', 'a contributor stays a contributor';
  assert public.sync_supporter_role('a9000000-0000-4000-8000-0000000000ff') is null, 'unknown profile';
end;
$$;
\echo 'ok  role sync'

-- One membership per subscription and per checkout session ---------------------------------------

update public.memberships set stripe_subscription_id = 'sub_test_one', stripe_checkout_session_id = 'cs_test_one'
 where profile_id = 'a9000000-0000-4000-8000-000000000001';
do $$
declare
  failed boolean := false;
begin
  begin
    insert into public.memberships (site_id, profile_id, tier_id, stripe_subscription_id)
    select t.site_id, 'a9000000-0000-4000-8000-000000000002', t.id, 'sub_test_one' from public.membership_tiers t where t.slug = 'monthly' limit 1;
  exception when unique_violation then failed := true; end;
  assert failed, 'a subscription id can belong to one membership only';
end;
$$;
\echo 'ok  unique ids'

-- As a reader: own membership only, no writes ----------------------------------------------------

set local request.jwt.claims = '{"role": "authenticated", "sub": "a9000000-0000-4000-8000-000000000001"}';
set local role authenticated;
do $$
declare
  failed boolean;
begin
  assert (select count(*) from public.memberships) = 1, 'a user sees their own membership only';

  failed := false;
  begin insert into public.memberships (site_id, profile_id, tier_id) select site_id, id, (select id from public.membership_tiers limit 1) from public.profiles limit 1;
  exception when insufficient_privilege then failed := true; end;
  assert failed, 'a user cannot insert a membership';
  failed := false;
  begin update public.memberships set status = 'active'; exception when insufficient_privilege then failed := true; end;
  assert failed, 'a user cannot update a membership';
  failed := false;
  begin update public.profiles set role = 'admin' where id = 'a9000000-0000-4000-8000-000000000001';
  exception when insufficient_privilege then failed := true; end;
  assert failed, 'a user cannot update profiles.role';
  failed := false;
  begin update public.profiles set stripe_customer_id = 'cus_selfselfself' where id = 'a9000000-0000-4000-8000-000000000001';
  exception when insufficient_privilege then failed := true; end;
  assert failed, 'a user cannot write stripe_customer_id directly';
  failed := false;
  begin perform public.sync_supporter_role('a9000000-0000-4000-8000-000000000001');
  exception when insufficient_privilege then failed := true; end;
  assert failed, 'a user cannot run sync_supporter_role';
  failed := false;
  begin perform 1 from public.stripe_events; exception when insufficient_privilege then failed := true; end;
  assert failed, 'a user cannot read stripe_events';

  -- attach_stripe_customer: once, for themselves.
  assert public.attach_stripe_customer('cus_readerone123'), 'attach sets the customer';
  assert not public.attach_stripe_customer('cus_readerchanged'), 'attach never overwrites';
  assert not public.attach_stripe_customer('not-a-customer'), 'attach rejects junk';
  assert (select stripe_customer_id from public.profiles where id = 'a9000000-0000-4000-8000-000000000001') = 'cus_readerone123', 'stored';
end;
$$;
reset role;
do $$
begin
  assert (select stripe_customer_id from public.profiles where id = 'a9000000-0000-4000-8000-000000000002') is null, 'attach touched only the caller';
end;
$$;
\echo 'ok  reader'

rollback;
\echo 'ALL 0009 MEMBERSHIP TESTS PASSED'
