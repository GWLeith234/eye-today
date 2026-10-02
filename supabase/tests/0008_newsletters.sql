-- supabase/tests/0008_newsletters.sql — newsletter signup, confirm, unsubscribe, access.
--
-- Run against a freshly reset local stack (plain psql, not `supabase test db`):
--   npx supabase db reset
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/0008_newsletters.sql
--
-- One transaction, rolled back.

\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
  ('a8000000-0000-4000-8000-00000000000e', 'nl.editor@qa.test', '{"full_name": "Nia Editor"}', now()),
  ('a8000000-0000-4000-8000-00000000000d', 'nl.reader@qa.test', '{"full_name": "Rae Reader"}', now());
update public.profiles set role = 'editor' where id = 'a8000000-0000-4000-8000-00000000000e';

do $$
begin
  assert (select count(*) from public.newsletter_lists where slug in ('daily', 'weekly')) >= 2, 'daily and weekly lists are seeded';
  assert (select name from public.newsletter_lists where slug = 'weekly' limit 1) = 'Weekly Roundup', 'weekly list name';
end;
$$;

-- As anon ------------------------------------------------------------------------------

set local request.jwt.claims = '{"role": "anon"}';
set local role anon;

do $$
declare
  failed boolean;
  h1 constant text := repeat('a', 64);
  ip constant text := repeat('1', 64);
  ok boolean;
begin
  failed := false;
  begin perform 1 from public.newsletter_subscribers;
  exception when insufficient_privilege then failed := true; end;
  assert failed, 'anon cannot select newsletter_subscribers';

  failed := false;
  begin perform 1 from public.newsletter_events;
  exception when insufficient_privilege then failed := true; end;
  assert failed, 'anon cannot select newsletter_events';

  failed := false;
  begin perform 1 from public.newsletter_deliveries;
  exception when insufficient_privilege then failed := true; end;
  assert failed, 'anon cannot select newsletter_deliveries';

  failed := false;
  begin perform 1 from public.newsletter_signup_attempts;
  exception when insufficient_privilege then failed := true; end;
  assert failed, 'anon cannot select newsletter_signup_attempts';

  failed := false;
  begin insert into public.newsletter_subscribers (site_id, list_id, email, status)
    select site_id, id, 'direct@qa.test', 'active' from public.newsletter_lists limit 1;
  exception when insufficient_privilege then failed := true; end;
  assert failed, 'anon cannot insert subscribers directly';

  -- Only the public list slugs; junk is refused.
  assert not public.request_newsletter_subscribe('a@qa.test', 'secret', ip, h1), 'unknown list slug';
  assert not public.request_newsletter_subscribe('not-an-email', 'daily', ip, h1), 'bad email';
  assert not public.request_newsletter_subscribe('a@qa.test', 'daily', 'short', h1), 'bad ip hash';
  assert not public.request_newsletter_subscribe('a@qa.test', 'daily', ip, 'short'), 'bad token hash';

  -- New address: pending, mixed case and spaces normalised.
  ok := public.request_newsletter_subscribe('  Reader.One@QA.test ', 'weekly', repeat('2', 64), h1);
  assert ok, 'new address returns true';
end;
$$;
reset role;

do $$
declare
  h1 constant text := repeat('a', 64);
begin
  assert (select status from public.newsletter_subscribers where email = 'reader.one@qa.test') = 'pending',
    'signup leaves the row pending, never active';
  assert (select consented_at from public.newsletter_subscribers where email = 'reader.one@qa.test') is not null, 'consented_at stored';
  assert (select confirm_token_hash from public.newsletter_subscribers where email = 'reader.one@qa.test') = h1, 'confirm hash stored';
  assert (select ip_hash from public.newsletter_subscribers where email = 'reader.one@qa.test') = repeat('2', 64), 'ip hash stored';
end;
$$;
\echo 'ok  signup'

-- The function cannot activate: an active row is left alone, and so is a bounced one.
update public.newsletter_subscribers set status = 'active', confirmed_at = now() where email = 'reader.one@qa.test';
insert into public.newsletter_subscribers (site_id, list_id, email, status)
select site_id, id, 'bounce@qa.test', 'bounced' from public.newsletter_lists where slug = 'weekly' limit 1;

set local request.jwt.claims = '{"role": "anon"}';
set local role anon;
do $$
begin
  assert not public.request_newsletter_subscribe('reader.one@qa.test', 'weekly', repeat('3', 64), repeat('b', 64)), 'active: returns false';
  assert not public.request_newsletter_subscribe('bounce@qa.test', 'weekly', repeat('3', 64), repeat('b', 64)), 'bounced: returns false';
end;
$$;
reset role;
do $$
begin
  assert (select status from public.newsletter_subscribers where email = 'reader.one@qa.test') = 'active', 'active row unchanged';
  assert (select confirm_token_hash from public.newsletter_subscribers where email = 'reader.one@qa.test') = repeat('a', 64), 'active row keeps its hash';
  assert (select status from public.newsletter_subscribers where email = 'bounce@qa.test') = 'bounced', 'bounced row unchanged';
end;
$$;
\echo 'ok  active and bounced untouched'

-- Rate limit: 5 calls an hour per ip hash; the sixth does nothing --------------------------

set local request.jwt.claims = '{"role": "anon"}';
set local role anon;
do $$
declare
  ip constant text := repeat('9', 64);
  i integer;
begin
  for i in 1..5 loop
    assert public.request_newsletter_subscribe('rate' || i || '@qa.test', 'daily', ip, repeat('c', 64)),
      format('call %s from one ip is allowed', i);
  end loop;
  assert not public.request_newsletter_subscribe('rate6@qa.test', 'daily', ip, repeat('c', 64)), 'a sixth call in an hour returns false';
  assert not public.request_newsletter_subscribe('rate1@qa.test', 'daily', ip, repeat('d', 64)), 'and still false';
  assert public.request_newsletter_subscribe('rate7@qa.test', 'daily', repeat('8', 64), repeat('c', 64)), 'another ip is not limited';
end;
$$;
reset role;
do $$
begin
  assert not exists (select 1 from public.newsletter_subscribers where email = 'rate6@qa.test'), 'the sixth call created nothing';
end;
$$;
\echo 'ok  rate limit'

-- Confirm --------------------------------------------------------------------------------

insert into public.newsletter_subscribers (site_id, list_id, email, status, consented_at, confirm_token_hash)
select site_id, id, 'confirm@qa.test', 'pending', now(), repeat('e', 64) from public.newsletter_lists where slug = 'daily' limit 1;
insert into public.newsletter_subscribers (site_id, list_id, email, status, consented_at, confirm_token_hash)
select site_id, id, 'stale@qa.test', 'pending', now() - interval '49 hours', repeat('f', 64) from public.newsletter_lists where slug = 'daily' limit 1;
insert into public.newsletter_subscribers (site_id, list_id, email, status, consented_at, confirm_token_hash)
select site_id, id, 'bounced2@qa.test', 'bounced', now(), repeat('0', 64) from public.newsletter_lists where slug = 'daily' limit 1;

set local request.jwt.claims = '{"role": "anon"}';
set local role anon;
do $$
begin
  assert not public.confirm_newsletter(repeat('7', 64), repeat('1', 64)), 'unknown token';
  assert not public.confirm_newsletter(repeat('f', 64), repeat('1', 64)), 'token older than 48 hours';
  assert not public.confirm_newsletter(repeat('0', 64), repeat('1', 64)), 'a bounced row is not confirmed';
  assert public.confirm_newsletter(repeat('e', 64), repeat('2', 64)), 'valid token confirms';
  assert not public.confirm_newsletter(repeat('e', 64), repeat('3', 64)), 'a token works once';
end;
$$;
reset role;
do $$
begin
  assert (select status from public.newsletter_subscribers where email = 'confirm@qa.test') = 'active', 'confirmed row is active';
  assert (select confirmed_at from public.newsletter_subscribers where email = 'confirm@qa.test') is not null, 'confirmed_at set';
  assert (select unsubscribe_token_hash from public.newsletter_subscribers where email = 'confirm@qa.test') = repeat('2', 64), 'unsubscribe hash stored';
  assert (select status from public.newsletter_subscribers where email = 'stale@qa.test') = 'pending', 'expired row stays pending';
  assert (select status from public.newsletter_subscribers where email = 'bounced2@qa.test') = 'bounced', 'bounced row stays bounced';
end;
$$;
\echo 'ok  confirm'

-- Unsubscribe ----------------------------------------------------------------------------

set local request.jwt.claims = '{"role": "anon"}';
set local role anon;
do $$
declare
  info record;
begin
  select * into info from public.newsletter_unsubscribe_info(repeat('2', 64));
  assert info.list_name = 'Daily Brief', 'info names the list';
  assert info.email_hint = 'c***@qa.test', format('info masks the address: %s', info.email_hint);
  assert (select count(*) from public.newsletter_unsubscribe_info(repeat('5', 64))) = 0, 'unknown token: no info';
end;
$$;
do $$
begin
  assert not public.unsubscribe_newsletter(repeat('5', 64)), 'unknown token';
  assert public.unsubscribe_newsletter(repeat('2', 64)), 'valid token unsubscribes';
  assert public.unsubscribe_newsletter(repeat('2', 64)), 'idempotent';
end;
$$;
reset role;
do $$
begin
  assert (select status from public.newsletter_subscribers where email = 'confirm@qa.test') = 'unsubscribed', 'row is unsubscribed';
  assert (select unsubscribed_at from public.newsletter_subscribers where email = 'confirm@qa.test') is not null, 'unsubscribed_at set';
end;
$$;
\echo 'ok  unsubscribe'

-- Signed-in reader: own subscriptions by confirmed auth email ---------------------------------

insert into public.newsletter_subscribers (site_id, list_id, email, status, confirmed_at)
select site_id, id, 'nl.reader@qa.test', 'active', now() from public.newsletter_lists where slug = 'weekly' limit 1;
insert into public.newsletter_subscribers (site_id, list_id, email, status, confirmed_at)
select site_id, id, 'someone.else@qa.test', 'active', now() from public.newsletter_lists where slug = 'weekly' limit 1;

set local request.jwt.claims = '{"role": "authenticated", "sub": "a8000000-0000-4000-8000-00000000000d"}';
set local role authenticated;
do $$
declare
  mine uuid;
begin
  assert (select count(*) from public.my_newsletter_subscriptions()) = 1, 'reader sees only their own subscription';
  select id into mine from public.my_newsletter_subscriptions();
  assert not public.unsubscribe_my_newsletter('00000000-0000-4000-8000-0000000000ff'), 'unknown id';
  assert (select count(*) from public.newsletter_subscribers) = 0, 'a reader sees no rows of the subscribers table';
  assert public.unsubscribe_my_newsletter(mine), 'reader unsubscribes themselves';
  assert (select count(*) from public.my_newsletter_subscriptions()) = 0, 'and it drops off their list';
end;
$$;
reset role;
do $$
begin
  assert (select status from public.newsletter_subscribers where email = 'someone.else@qa.test') = 'active', 'someone else is untouched';
end;
$$;
\echo 'ok  account'

-- Editors ----------------------------------------------------------------------------------

set local request.jwt.claims = '{"role": "authenticated", "sub": "a8000000-0000-4000-8000-00000000000e"}';
set local role authenticated;
do $$
declare
  v_list uuid;
  v_site uuid;
  v_issue uuid;
  sub_id uuid;
  failed boolean;
begin
  select l.id, l.site_id into v_list, v_site from public.newsletter_lists l where l.slug = 'weekly' limit 1;
  assert v_list is not null, 'editor reads lists';
  assert (select count(*) from public.newsletter_subscribers) > 0, 'editor reads subscribers';
  select s.id into sub_id from public.newsletter_subscribers s where s.email = 'someone.else@qa.test';

  insert into public.newsletter_issues (site_id, list_id, subject, intro)
  values (v_site, v_list, 'Weekly Roundup', 'Hello') returning id into v_issue;
  update public.newsletter_issues set status = 'sent', sent_at = now() where id = v_issue;

  update public.newsletter_issues set subject = 'Edited after sending' where id = v_issue;
  assert (select subject from public.newsletter_issues where id = v_issue) = 'Weekly Roundup', 'a sent issue cannot be edited';

  insert into public.newsletter_deliveries (site_id, issue_id, subscriber_id) values (v_site, v_issue, sub_id);
  update public.newsletter_deliveries set provider_id = 'prov-1' where newsletter_deliveries.issue_id = v_issue;
  failed := false;
  begin insert into public.newsletter_deliveries (site_id, issue_id, subscriber_id) values (v_site, v_issue, sub_id);
  exception when unique_violation then failed := true; end;
  assert failed, 'a second delivery for the same issue and subscriber conflicts';

  failed := false;
  begin insert into public.newsletter_events (site_id, issue_id, subscriber_id, provider_id, event_type)
    values (v_site, v_issue, sub_id, 'prov-1', 'delivered');
  exception when insufficient_privilege then failed := true; end;
  assert failed, 'editors cannot insert events';
  assert (select count(*) from public.newsletter_events) = 0, 'editor reads events';

  failed := false;
  begin update public.newsletter_subscribers set status = 'active' where id = sub_id;
  exception when insufficient_privilege then failed := true; end;
  assert failed, 'editors cannot change subscribers';
end;
$$;
reset role;

-- The webhook path (service role) can record each event once.
insert into public.newsletter_events (site_id, issue_id, subscriber_id, provider_id, event_type)
select d.site_id, d.issue_id, d.subscriber_id, 'prov-1', 'delivered' from public.newsletter_deliveries d where provider_id = 'prov-1';
do $$
declare
  failed boolean := false;
begin
  begin
    insert into public.newsletter_events (site_id, issue_id, subscriber_id, provider_id, event_type)
    select d.site_id, d.issue_id, d.subscriber_id, 'prov-1', 'delivered' from public.newsletter_deliveries d where provider_id = 'prov-1';
  exception when unique_violation then failed := true; end;
  assert failed, 'the same provider event twice hits the unique key';
end;
$$;
\echo 'ok  editors and events'

rollback;
\echo 'ALL 0008 NEWSLETTER TESTS PASSED'
