-- supabase/tests/0013_directory.sql — directory RLS, search and submissions.
--
-- Run against a freshly reset local stack (plain psql, not `supabase test db`):
--   npx supabase db reset
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/0013_directory.sql
--
-- One transaction, rolled back.

\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email) values
  ('d1200000-0000-4000-8000-0000000000e1', 'dir.editor@qa.test'),
  ('d1200000-0000-4000-8000-0000000000d1', 'dir.reader@qa.test');
update public.profiles set role = 'editor' where id = 'd1200000-0000-4000-8000-0000000000e1';

do $$
begin
  assert (select count(*) from public.directory_categories
           where site_id = '00000000-0000-4000-8000-000000000001') = 7,
    'seven categories seeded';
  assert (select count(*) from public.country_legal_status
           where site_id = '00000000-0000-4000-8000-000000000001'
             and status = 'draft'
             and summary_html = ''
             and title = '') = 10,
    'ten empty legal-status drafts';
end;
$$;

insert into public.directory_listings (
  id, site_id, category_id, slug, name, country_code, city, services, description,
  status, verification_level, verification_note
) values
  ('d1200000-0000-4000-8000-0000000000a1',
   '00000000-0000-4000-8000-000000000001',
   (select id from public.directory_categories where slug = 'treatment-clinic' and site_id = '00000000-0000-4000-8000-000000000001'),
   'alpha-retreat', 'Alpha Retreat', 'MX', 'Tulum', array['retreat'], 'A published retreat.',
   'published', 'verified', 'Checked the public website.'),
  ('d1200000-0000-4000-8000-0000000000b1',
   '00000000-0000-4000-8000-000000000001',
   (select id from public.directory_categories where slug = 'treatment-clinic' and site_id = '00000000-0000-4000-8000-000000000001'),
   'bravo-retreat', 'Bravo Retreat', 'MX', 'Tulum', array['retreat'], 'Also published.',
   'published', 'listed', 'Added by an editor.'),
  ('d1200000-0000-4000-8000-0000000000c1',
   '00000000-0000-4000-8000-000000000001',
   (select id from public.directory_categories where slug = 'treatment-clinic' and site_id = '00000000-0000-4000-8000-000000000001'),
   'pending-retreat', 'Pending Retreat', 'MX', 'Tulum', array['retreat'], 'Not public.',
   'pending', 'listed', 'Awaiting review.');

insert into public.listing_submissions (id, site_id, contact_email, status, payload)
values (
  'd1200000-0000-4000-8000-0000000000d2',
  '00000000-0000-4000-8000-000000000001',
  'hidden@qa.test',
  'pending',
  '{"name":"Hidden Submission"}'::jsonb
);

set local request.jwt.claims = '{"role": "anon"}';
set local role anon;

do $$
declare
  failed boolean;
begin
  failed := false;
  begin
    perform 1 from public.listing_submissions;
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'anon cannot select submissions';

  failed := false;
  begin
    insert into public.listing_submissions (site_id, contact_email, payload)
    values ('00000000-0000-4000-8000-000000000001', 'sneaky@qa.test', '{}'::jsonb);
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'anon cannot insert a submission directly';

  failed := false;
  begin
    update public.directory_listings set name = 'Hacked' where slug = 'alpha-retreat';
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'anon cannot update listings';

  assert (select count(*) from public.directory_listings where slug = 'pending-retreat') = 0,
    'anon cannot see a pending listing';
  assert (select count(*) from public.directory_listings where slug = 'alpha-retreat') = 1,
    'anon can see a published listing';
  assert (select count(*) from public.directory_legal('MX')) = 0,
    'anon cannot see a draft legal-status page';
  assert (
    select slug from public.directory_search(null, 'MX', 'treatment-clinic', null, null, 1)
     order by name
     limit 1
  ) = 'alpha-retreat',
    'empty query is alphabetical';
  assert (select count(*) from public.directory_search('pending', null, null, null, null, 1)) = 0,
    'search does not return a pending listing';
  assert (select verification_level from public.directory_listing('alpha-retreat')) = 'verified',
    'published listing is readable by slug';
  assert (select count(*) from public.directory_listing('pending-retreat')) = 0,
    'pending listing is not readable by slug';
end;
$$;

select public.submit_directory_listing(
  'Submitted Retreat', 'treatment-clinic', 'mx', 'Quintana Roo', 'Tulum',
  'retreat', 'English', 'https://example.com', 'public@example.com', '+52 1',
  'A short description.', 'submitter@qa.test'
);

reset role;

do $$
begin
  assert (select count(*) from public.listing_submissions where contact_email = 'submitter@qa.test' and status = 'pending') = 1,
    'definer function stores a pending submission';
  assert (select payload ->> 'country_code' from public.listing_submissions where contact_email = 'submitter@qa.test') = 'MX',
    'country code is stored uppercase';
  assert (select name from public.directory_listings where slug = 'alpha-retreat') = 'Alpha Retreat',
    'anon update did not change the listing';
end;
$$;

set local request.jwt.claims = '{"role": "anon"}';
set local role anon;

select public.submit_directory_listing(
  'Submitted Two', 'treatment-clinic', 'MX', null, null, null, null, null, null, null, 'Two', 'submitter@qa.test'
);
select public.submit_directory_listing(
  'Submitted Three', 'treatment-clinic', 'MX', null, null, null, null, null, null, null, 'Three', 'submitter@qa.test'
);

do $$
declare
  failed boolean := false;
begin
  begin
    perform public.submit_directory_listing(
      'Submitted Four', 'treatment-clinic', 'MX', null, null, null, null, null, null, null, 'Four', 'submitter@qa.test'
    );
  exception when others then failed := sqlerrm = 'too many submissions';
  end;
  assert failed, 'fourth submission in 24 hours is refused';

  failed := false;
  begin
    perform public.submit_directory_listing(
      'Bad', 'not-a-category', 'MX', null, null, null, null, null, null, null, 'No', 'other@qa.test'
    );
  exception when others then failed := sqlerrm = 'invalid submission';
  end;
  assert failed, 'unknown category is refused';
end;
$$;

reset role;

set local request.jwt.claims = '{"sub": "d1200000-0000-4000-8000-0000000000d1", "role": "authenticated"}';
set local role authenticated;

do $$
begin
  assert (select count(*) from public.listing_submissions) = 0,
    'a reader cannot read submissions';
  assert (select count(*) from public.directory_listings where slug = 'pending-retreat') = 0,
    'a reader cannot see a pending listing';
end;
$$;

reset role;

set local request.jwt.claims = '{"sub": "d1200000-0000-4000-8000-0000000000e1", "role": "authenticated"}';
set local role authenticated;

do $$
begin
  assert (select count(*) from public.listing_submissions where contact_email = 'submitter@qa.test') = 3,
    'an editor can read submissions';
  assert (select count(*) from public.directory_listings where slug = 'pending-retreat') = 1,
    'an editor can see a pending listing';
end;
$$;

reset role;

update public.country_legal_status
   set status = 'published', title = 'Mexico', summary_html = '<p>Draft text</p>', as_of = '2026-01-01'
 where country_code = 'MX' and site_id = '00000000-0000-4000-8000-000000000001';

update public.directory_categories set hidden = true
 where slug = 'treatment-clinic' and site_id = '00000000-0000-4000-8000-000000000001';

set local request.jwt.claims = '{"role": "anon"}';
set local role anon;

do $$
begin
  assert (select title from public.directory_legal('MX')) = 'Mexico',
    'anon can read a published legal-status page';
  assert (select count(*) from public.directory_search(null, 'MX', 'treatment-clinic', null, null, 1)) = 0,
    'a hidden category drops its listings from search';
  assert (select has_legal from public.directory_listing('alpha-retreat')) is null,
    'a hidden category hides the listing page';
end;
$$;

reset role;
\echo 'ok  directory rls'
rollback;
