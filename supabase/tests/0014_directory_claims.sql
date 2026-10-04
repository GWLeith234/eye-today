-- supabase/tests/0014_directory_claims.sql — claims, owner edits, featured ordering, reports.
--
-- Run against a freshly reset local stack (plain psql, not `supabase test db`):
--   npx supabase db reset
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/0014_directory_claims.sql
--
-- One transaction, rolled back.

\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email) values
  ('d1400000-0000-4000-8000-0000000000e1', 'claims.editor@qa.test'),
  ('d1400000-0000-4000-8000-0000000000b1', 'claims.owner@qa.test'),
  ('d1400000-0000-4000-8000-0000000000c1', 'claims.stranger@qa.test');
update public.profiles set role = 'editor' where id = 'd1400000-0000-4000-8000-0000000000e1';

create function pg_temp.listing(p_id uuid, p_slug text, p_name text, p_country text, p_website text)
returns void language sql as $$
  insert into public.directory_listings (id, site_id, category_id, slug, name, country_code, website, description, status, verification_level, verification_note)
  values (p_id, '00000000-0000-4000-8000-000000000001',
          (select id from public.directory_categories where slug = 'treatment-clinic' and site_id = '00000000-0000-4000-8000-000000000001'),
          p_slug, p_name, p_country, p_website, 'A listing.', 'published', 'verified', 'Checked.');
$$;

select pg_temp.listing('d1400000-0000-4000-8000-0000000000a1', 'claimco', 'Claimco', 'MX', 'https://www.claimco.example/about');
select pg_temp.listing('d1400000-0000-4000-8000-0000000000a2', 'claimco-two', 'Claimco Two', 'MX', 'https://claimco.example');
select pg_temp.listing('d1400000-0000-4000-8000-0000000000a3', 'nosite', 'No Site', 'MX', null);
insert into public.directory_listings (id, site_id, category_id, slug, name, country_code, description, status, verification_level, verification_note)
values ('d1400000-0000-4000-8000-0000000000a4', '00000000-0000-4000-8000-000000000001',
        (select id from public.directory_categories where slug = 'treatment-clinic' and site_id = '00000000-0000-4000-8000-000000000001'),
        'hidden-draft', 'Hidden Draft', 'MX', 'Draft.', 'draft', 'listed', 'Draft.');

-- Anon ---------------------------------------------------------------------------------

set local request.jwt.claims = '{"role": "anon"}';
set local role anon;
do $$
declare
  t text;
  failed boolean;
begin
  foreach t in array array['listing_claims', 'listing_owners', 'listing_edit_proposals', 'listing_features', 'listing_reports', 'article_listings'] loop
    failed := false;
    begin
      execute format('select 1 from public.%I', t);
    exception when insufficient_privilege then failed := true;
    end;
    assert failed, 'anon cannot read ' || t;
  end loop;
  failed := false;
  begin perform public.request_listing_claim('d1400000-0000-4000-8000-0000000000a1', 'x@claimco.example');
  exception when insufficient_privilege then failed := true; end;
  assert failed, 'anon cannot request a claim';
  failed := false;
  begin perform public.confirm_listing_claim('d1400000-0000-4000-8000-0000000000a1', '12345678');
  exception when insufficient_privilege then failed := true; end;
  assert failed, 'anon cannot confirm a claim';
  failed := false;
  begin perform public.set_listing_claim_code(gen_random_uuid(), repeat('a', 64));
  exception when insufficient_privilege then failed := true; end;
  assert failed, 'anon cannot set a claim code';
  assert (select count(*) from public.directory_listing('hidden-draft')) = 0, 'a draft has no public page';
  assert (select id from public.directory_listing('claimco')) = 'd1400000-0000-4000-8000-0000000000a1', 'the listing page carries the id';
end;
$$;
reset role;
\echo 'ok  anon'

-- Claims -------------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "d1400000-0000-4000-8000-0000000000b1", "role": "authenticated"}';
set local role authenticated;
do $$
declare
  failed boolean;
  claim uuid;
begin
  -- A mailbox on some other domain, and a listing with no website, cannot claim.
  failed := false;
  begin perform public.request_listing_claim('d1400000-0000-4000-8000-0000000000a1', 'me@gmail.example');
  exception when others then failed := sqlerrm = 'domain mismatch'; end;
  assert failed, 'a different domain is refused';
  failed := false;
  begin perform public.request_listing_claim('d1400000-0000-4000-8000-0000000000a3', 'me@nosite.example');
  exception when others then failed := sqlerrm = 'domain mismatch'; end;
  assert failed, 'a listing without a website cannot be claimed by email';
  failed := false;
  begin perform public.request_listing_claim('d1400000-0000-4000-8000-0000000000a4', 'me@claimco.example');
  exception when others then failed := true; end;
  assert failed, 'an unpublished listing cannot be claimed';

  -- The listing's website is www.claimco.example: both spellings are accepted.
  claim := public.request_listing_claim('d1400000-0000-4000-8000-0000000000a1', 'me@claimco.example');
  assert claim is not null, 'bare domain accepted';
  assert public.request_listing_claim('d1400000-0000-4000-8000-0000000000a2', 'me@claimco.example') is not null, 'bare host accepted';

  -- The code hash is never readable, and a person cannot verify themselves.
  failed := false;
  begin perform code_hash from public.listing_claims; exception when insufficient_privilege then failed := true; end;
  assert failed, 'code_hash is not readable';
  failed := false;
  begin perform public.set_listing_claim_code(claim, repeat('a', 64));
  exception when insufficient_privilege then failed := true; end;
  assert failed, 'a user cannot choose their own code hash';
  update public.listing_claims set status = 'verified' where id = claim;
  assert (select status from public.listing_claims where id = claim) = 'pending', 'a user cannot verify their own claim';
  assert not public.is_listing_owner('d1400000-0000-4000-8000-0000000000a1'), 'not an owner yet';
  assert not public.confirm_listing_claim('d1400000-0000-4000-8000-0000000000a1', '12345678'), 'no code was issued yet';
end;
$$;
reset role;

-- The server issues the codes (service role only). Code for a1 is 12345678; a2 is 87654321.
set local role service_role;
do $$
begin
  assert public.set_listing_claim_code(
    (select id from public.listing_claims where listing_id = 'd1400000-0000-4000-8000-0000000000a1'),
    encode(extensions.digest('12345678', 'sha256'), 'hex')) = 'me@claimco.example', 'the code goes to the validated address';
  perform public.set_listing_claim_code(
    (select id from public.listing_claims where listing_id = 'd1400000-0000-4000-8000-0000000000a2'),
    encode(extensions.digest('87654321', 'sha256'), 'hex'));
end;
$$;
reset role;

-- A stranger cannot confirm someone else's claim.
set local request.jwt.claims = '{"sub": "d1400000-0000-4000-8000-0000000000c1", "role": "authenticated"}';
set local role authenticated;
do $$
begin
  assert not public.confirm_listing_claim('d1400000-0000-4000-8000-0000000000a1', '12345678'), 'a stranger cannot confirm';
  assert (select count(*) from public.listing_claims) = 0, 'a stranger sees no claims';
end;
$$;
reset role;

set local request.jwt.claims = '{"sub": "d1400000-0000-4000-8000-0000000000b1", "role": "authenticated"}';
set local role authenticated;
do $$
begin
  assert not public.confirm_listing_claim('d1400000-0000-4000-8000-0000000000a1', '00000000'), 'wrong code is false';
  assert public.confirm_listing_claim('d1400000-0000-4000-8000-0000000000a1', '12345678'), 'the right code verifies';
  assert public.is_listing_owner('d1400000-0000-4000-8000-0000000000a1'), 'now an owner';
  assert (select count(*) from public.listing_owners) = 1, 'the owner sees their row';
end;
$$;
reset role;

-- Expired code: a2 fails with the right code once expires_at is past, and the claim is marked expired.
update public.listing_claims set expires_at = now() - interval '1 minute'
 where listing_id = 'd1400000-0000-4000-8000-0000000000a2';
set local request.jwt.claims = '{"sub": "d1400000-0000-4000-8000-0000000000b1", "role": "authenticated"}';
set local role authenticated;
do $$
begin
  assert not public.confirm_listing_claim('d1400000-0000-4000-8000-0000000000a2', '87654321'), 'an expired code fails';
  assert (select status from public.listing_claims where listing_id = 'd1400000-0000-4000-8000-0000000000a2') = 'expired', 'marked expired';
  assert not public.is_listing_owner('d1400000-0000-4000-8000-0000000000a2'), 'no ownership from an expired claim';
end;
$$;
reset role;
\echo 'ok  claims'

-- Owner edits never change verification ---------------------------------------------------

set local request.jwt.claims = '{"sub": "d1400000-0000-4000-8000-0000000000b1", "role": "authenticated"}';
set local role authenticated;
do $$
declare
  proposal uuid;
  failed boolean;
begin
  update public.directory_listings set name = 'Hacked' where id = 'd1400000-0000-4000-8000-0000000000a1';
  assert (select name from public.directory_listings where id = 'd1400000-0000-4000-8000-0000000000a1') = 'Claimco', 'an owner cannot update the listing directly';

  proposal := public.propose_listing_edit(
    'd1400000-0000-4000-8000-0000000000a1',
    '{"name": "Claimco Clinic", "city": "Tulum", "services": ["retreat"], "verification_level": "medically_supervised", "status": "draft", "lat": 5, "lng": 5, "relationship_disclosure": "none", "verification_note": "x"}'::jsonb);
  assert (select payload from public.listing_edit_proposals where id = proposal) = '{"name": "Claimco Clinic", "city": "Tulum", "services": ["retreat"]}'::jsonb,
    'only whitelisted keys are stored';
  update public.listing_edit_proposals set status = 'approved' where id = proposal;
  assert (select status from public.listing_edit_proposals where id = proposal) = 'pending', 'an owner cannot approve their own proposal';
  failed := false;
  begin perform public.approve_listing_proposal(proposal); exception when insufficient_privilege then failed := true; end;
  assert failed, 'an owner cannot call approve';
end;
$$;
reset role;

set local request.jwt.claims = '{"sub": "d1400000-0000-4000-8000-0000000000c1", "role": "authenticated"}';
set local role authenticated;
do $$
declare
  failed boolean;
begin
  failed := false;
  begin perform public.propose_listing_edit('d1400000-0000-4000-8000-0000000000a1', '{"name": "Nope"}'::jsonb);
  exception when insufficient_privilege then failed := true; end;
  assert failed, 'a stranger cannot propose';
end;
$$;
reset role;

set local request.jwt.claims = '{"sub": "d1400000-0000-4000-8000-0000000000e1", "role": "authenticated"}';
set local role authenticated;
do $$
declare
  r record;
begin
  select * into r from public.approve_listing_proposal((select id from public.listing_edit_proposals limit 1));
  assert r.old_slug = 'claimco' and r.new_slug = 'claimco', 'slug is not changed by a proposal';
  assert r.old_country = 'MX' and r.new_country = 'MX', 'country unchanged';
  assert (select name from public.directory_listings where id = 'd1400000-0000-4000-8000-0000000000a1') = 'Claimco Clinic', 'the edit is applied';
  assert (select city from public.directory_listings where id = 'd1400000-0000-4000-8000-0000000000a1') = 'Tulum', 'city applied';
  assert (select verification_level::text from public.directory_listings where id = 'd1400000-0000-4000-8000-0000000000a1') = 'verified', 'verification level is unchanged';
  assert (select status from public.directory_listings where id = 'd1400000-0000-4000-8000-0000000000a1') = 'published', 'status is unchanged';
  assert (select lat from public.directory_listings where id = 'd1400000-0000-4000-8000-0000000000a1') is null, 'coordinates are unchanged';
  assert (select relationship_disclosure from public.directory_listings where id = 'd1400000-0000-4000-8000-0000000000a1') is null, 'disclosure is unchanged';
  assert (select public.directory_editor_note('d1400000-0000-4000-8000-0000000000a1')) = 'Checked.', 'verification note is unchanged';
end;
$$;
reset role;
\echo 'ok  proposals'

-- Featured ordering ------------------------------------------------------------------------

insert into public.directory_listings (site_id, category_id, slug, name, country_code, description, status, verification_level, verification_note)
select '00000000-0000-4000-8000-000000000001',
       (select id from public.directory_categories where slug = 'treatment-clinic' and site_id = '00000000-0000-4000-8000-000000000001'),
       'zz-' || lpad(n::text, 2, '0'), 'Listing ' || lpad(n::text, 2, '0'), 'ZZ', 'Filler.', 'published', 'listed', 'Added.'
  from generate_series(1, 30) n;

insert into public.listing_features (site_id, listing_id, stripe_subscription_id, status, current_period_end)
select '00000000-0000-4000-8000-000000000001', l.id, 'sub_' || l.slug, 'active', now() + interval '10 days'
  from public.directory_listings l where l.slug in ('zz-27', 'zz-28', 'zz-29', 'zz-30');
-- A feature whose period has ended no longer counts, and a cancelled one never does.
insert into public.listing_features (site_id, listing_id, stripe_subscription_id, status, current_period_end)
select '00000000-0000-4000-8000-000000000001', l.id, 'sub_' || l.slug, 'active', now() - interval '1 day'
  from public.directory_listings l where l.slug = 'zz-01';
insert into public.listing_features (site_id, listing_id, stripe_subscription_id, status, current_period_end)
select '00000000-0000-4000-8000-000000000001', l.id, 'sub_' || l.slug, 'canceled', now() + interval '10 days'
  from public.directory_listings l where l.slug = 'zz-02';

set local request.jwt.claims = '{"role": "anon"}';
set local role anon;
do $$
declare
  page1 text[];
  page2 text[];
begin
  select array_agg(slug order by ord) into page1 from (select slug, row_number() over () ord from public.directory_search(null, 'ZZ', null, null, null, 1)) s;
  select array_agg(slug order by ord) into page2 from (select slug, row_number() over () ord from public.directory_search(null, 'ZZ', null, null, null, 2)) s;

  assert cardinality(page1) = 24, 'page 1 holds 24';
  assert page1[1:3] = array['zz-27', 'zz-28', 'zz-29'], 'at most three featured listings are pinned, in order';
  assert page1[4] = 'zz-01', 'organic rows follow, alphabetical, and a lapsed feature is organic';
  assert page1[24] = 'zz-21', 'page 1 ends at the 21st organic row';
  assert page2 = array['zz-22', 'zz-23', 'zz-24', 'zz-25', 'zz-26', 'zz-30'], 'page 2 continues without repeating or skipping';
  assert not (page1 && page2), 'no listing appears on both pages';
  assert (select count(*) from (select distinct slug from public.directory_search(null, 'ZZ', null, null, null, 1)) s) = 24, 'each listing once';
  assert (select count(*) from public.directory_search(null, 'ZZ', null, null, null, 1) where featured) = 3, 'three featured cards';
  assert (select featured from public.directory_search(null, 'ZZ', null, null, null, 2) where slug = 'zz-30') = false, 'a fourth featured match is not labelled';
  assert (select featured from public.directory_search(null, 'ZZ', null, null, null, 1) where slug = 'zz-01') = false, 'a lapsed feature is not featured';
  assert (select featured from public.directory_search(null, 'ZZ', null, null, null, 1) where slug = 'zz-02') = false, 'a cancelled feature is not featured';
  assert public.directory_search_count(null, 'ZZ', null, null, null) = 30, 'the count is unchanged by features';
  assert (select count(*) from public.directory_search('listing 29', 'ZZ', null, null, null, 1)) >= 1, 'search still works';
end;
$$;
reset role;
\echo 'ok  featured ordering'

-- Features RLS: owners read status, never the Stripe ids; strangers read nothing.
insert into public.listing_features (site_id, listing_id, stripe_subscription_id, stripe_customer_id, status, current_period_end)
values ('00000000-0000-4000-8000-000000000001', 'd1400000-0000-4000-8000-0000000000a1', 'sub_claimco', 'cus_claimco1', 'active', now() + interval '5 days');
set local request.jwt.claims = '{"sub": "d1400000-0000-4000-8000-0000000000b1", "role": "authenticated"}';
set local role authenticated;
do $$
declare
  failed boolean := false;
begin
  assert (select count(*) from public.listing_features) = 1, 'the owner sees only their listing''s feature';
  begin perform stripe_subscription_id from public.listing_features; exception when insufficient_privilege then failed := true; end;
  assert failed, 'Stripe ids are not readable';
end;
$$;
reset role;
set local request.jwt.claims = '{"sub": "d1400000-0000-4000-8000-0000000000c1", "role": "authenticated"}';
set local role authenticated;
do $$
begin
  assert (select count(*) from public.listing_features) = 0, 'a stranger sees no features';
  assert (select count(*) from public.listing_owners) = 0, 'a stranger sees no owners';
  assert (select count(*) from public.listing_edit_proposals) = 0, 'a stranger sees no proposals';
end;
$$;
reset role;

-- Reports --------------------------------------------------------------------------------

set local request.jwt.claims = '{"role": "anon"}';
set local role anon;
do $$
declare
  failed boolean;
  i integer;
begin
  perform public.report_listing('d1400000-0000-4000-8000-0000000000a1', 'rep@qa.test', 'The phone number is wrong.');
  failed := false;
  begin perform public.report_listing('d1400000-0000-4000-8000-0000000000a4', 'rep@qa.test', 'A draft.');
  exception when others then failed := sqlerrm = 'invalid report'; end;
  assert failed, 'an unpublished listing cannot be reported';
  failed := false;
  begin perform public.report_listing('d1400000-0000-4000-8000-0000000000a1', 'not-an-email', 'x');
  exception when others then failed := sqlerrm = 'invalid report'; end;
  assert failed, 'a bad email is refused';
  for i in 1..4 loop
    perform public.report_listing('d1400000-0000-4000-8000-0000000000a1', 'rep@qa.test', 'Again ' || i);
  end loop;
  failed := false;
  begin perform public.report_listing('d1400000-0000-4000-8000-0000000000a1', 'rep@qa.test', 'One too many');
  exception when others then failed := sqlerrm = 'too many reports'; end;
  assert failed, 'the sixth report from one email in a day is refused';
end;
$$;
reset role;

-- Editors read and close reports; nobody else reads them.
set local request.jwt.claims = '{"sub": "d1400000-0000-4000-8000-0000000000e1", "role": "authenticated"}';
set local role authenticated;
do $$
begin
  assert (select count(*) from public.listing_reports where status = 'open') = 5, 'editors see open reports';
  update public.listing_reports set status = 'closed' where reason = 'The phone number is wrong.';
  assert (select count(*) from public.listing_reports where status = 'open') = 4, 'editors close a report';
end;
$$;
reset role;
set local request.jwt.claims = '{"sub": "d1400000-0000-4000-8000-0000000000b1", "role": "authenticated"}';
set local role authenticated;
do $$
begin
  assert (select count(*) from public.listing_reports) = 0, 'an owner does not read reports';
end;
$$;
reset role;
\echo 'ok  reports'

-- Article links: only when both the article and the listing are published ----------------

insert into public.articles (id, site_id, section_id, slug, title, status, published_at)
values ('d1400000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000101', 'directory-story', 'Directory story', 'published', now() - interval '1 hour'),
       ('d1400000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000101', 'draft-story', 'Draft story', 'draft', null);
insert into public.article_listings (article_id, listing_id, site_id) values
  ('d1400000-0000-4000-8000-0000000000f1', 'd1400000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001'),
  ('d1400000-0000-4000-8000-0000000000f1', 'd1400000-0000-4000-8000-0000000000a4', '00000000-0000-4000-8000-000000000001'),
  ('d1400000-0000-4000-8000-0000000000f2', 'd1400000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001');

set local request.jwt.claims = '{"role": "anon"}';
set local role anon;
do $$
begin
  assert (select count(*) from public.article_directory_cards('d1400000-0000-4000-8000-0000000000f1')) = 1, 'only the published listing shows on a live article';
  assert (select count(*) from public.article_directory_cards('d1400000-0000-4000-8000-0000000000f2')) = 0, 'a draft article shows nothing';
  assert (select count(*) from public.directory_listing_stories('d1400000-0000-4000-8000-0000000000a1', '{}')) = 1, 'the listing shows the attached live story, not the draft';
  assert (select count(*) from public.directory_listing_stories('d1400000-0000-4000-8000-0000000000a4', '{}')) = 0, 'a draft listing shows no stories';
end;
$$;
reset role;
\echo 'ok  article links'

rollback;
