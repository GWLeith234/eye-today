-- supabase/tests/0017_postings.sql — postings: RLS, poster writes, payments, approval, expiry, public reads.
--
-- Run against a freshly reset local stack (plain psql, not `supabase test db`):
--   npx supabase db reset
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/0017_postings.sql
--
-- One transaction, rolled back.

\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email) values
  ('d1700000-0000-4000-8000-0000000000e1', 'po.editor@qa.test'),
  ('d1700000-0000-4000-8000-0000000000a1', 'po.alice@qa.test'),
  ('d1700000-0000-4000-8000-0000000000b1', 'po.bob@qa.test');
update public.profiles set role = 'editor' where id = 'd1700000-0000-4000-8000-0000000000e1';

insert into public.directory_listings (
  id, site_id, category_id, slug, name, country_code, city, description, status, verification_level, verification_note
) values
  ('d1700000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-000000000001',
   (select id from public.directory_categories where slug = 'treatment-clinic' and site_id = '00000000-0000-4000-8000-000000000001'),
   'po-clinic', 'Po Clinic', 'MX', 'Tulum', 'Public.', 'published', 'listed', 'ok');

-- Seeded rows (owner inserts keep what they are given). Two days old so the poster cap is exact.
insert into public.postings (
  id, site_id, kind, slug, title, organisation, location, country_code, remote, employment_type, category,
  description_html, apply_url, poster_id, contact_email, status, approved_at, published_at, expires_at, closing_date, created_at
) values
  ('d1700000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-000000000001', 'job', 'po-live', 'Live Nurse', 'Clinic A',
   'Tulum', 'MX', 'onsite', 'full_time', null, '<p>Live</p>', 'https://example.com/a', 'd1700000-0000-4000-8000-0000000000a1',
   'secret-a@qa.test', 'published', now() - interval '1 day', now() - interval '1 day', now() + interval '29 days', null, now() - interval '2 days'),
  ('d1700000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-000000000001', 'job', 'po-past-expiry', 'Expired Job', 'Clinic A',
   null, null, 'remote', 'contract', null, '', 'https://example.com/b', 'd1700000-0000-4000-8000-0000000000a1',
   'secret-a@qa.test', 'published', now() - interval '40 days', now() - interval '40 days', now() - interval '1 hour', null, now() - interval '2 days'),
  ('d1700000-0000-4000-8000-0000000000f3', '00000000-0000-4000-8000-000000000001', 'job', 'po-closed', 'Closed Job', 'Clinic A',
   'Tulum', 'MX', 'onsite', 'part_time', null, '', 'https://example.com/c', 'd1700000-0000-4000-8000-0000000000a1',
   'secret-a@qa.test', 'published', now() - interval '5 days', now() - interval '5 days', now() + interval '20 days', current_date - 1, now() - interval '2 days'),
  ('d1700000-0000-4000-8000-0000000000f4', '00000000-0000-4000-8000-000000000001', 'job', 'po-pending', 'Pending Job', 'Clinic B',
   'Durban', 'ZA', 'hybrid', 'full_time', null, '', 'https://example.com/d', 'd1700000-0000-4000-8000-0000000000b1',
   'secret-b@qa.test', 'pending', null, null, null, null, now() - interval '2 days'),
  ('d1700000-0000-4000-8000-0000000000f5', '00000000-0000-4000-8000-000000000001', 'classified', 'po-training', 'Facilitator Training', 'School C',
   null, null, 'remote', null, 'training', '', 'https://example.com/e', 'd1700000-0000-4000-8000-0000000000b1',
   'secret-b@qa.test', 'published', now() - interval '1 day', now() - interval '1 day', now() + interval '10 days', null, now() - interval '2 days');

do $$
declare
  failed boolean := false;
begin
  begin
    insert into public.postings (site_id, kind, slug, title, organisation, remote, employment_type, category,
      apply_url, poster_id, contact_email)
    values ('00000000-0000-4000-8000-000000000001', 'job', 'bad-kind', 'X', 'Y', 'remote', null, 'training',
      'https://x.test', 'd1700000-0000-4000-8000-0000000000a1', 'x@qa.test');
  exception when check_violation then failed := true;
  end;
  assert failed, 'a job needs an employment type and no category';

  failed := false;
  begin
    insert into public.postings (site_id, kind, slug, title, organisation, remote, employment_type,
      poster_id, contact_email)
    values ('00000000-0000-4000-8000-000000000001', 'job', 'no-apply', 'X', 'Y', 'remote', 'full_time',
      'd1700000-0000-4000-8000-0000000000a1', 'x@qa.test');
  exception when check_violation then failed := true;
  end;
  assert failed, 'a posting needs a way to apply';

  failed := false;
  begin
    insert into public.postings (site_id, kind, slug, title, organisation, remote, employment_type, apply_url,
      poster_id, contact_email, status)
    values ('00000000-0000-4000-8000-000000000001', 'job', 'no-expiry', 'X', 'Y', 'remote', 'full_time', 'https://x.test',
      'd1700000-0000-4000-8000-0000000000a1', 'x@qa.test', 'published');
  exception when check_violation then failed := true;
  end;
  assert failed, 'a published posting needs an expiry';
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
    perform 1 from public.postings;
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'anon cannot select postings';
  failed := false;
  begin
    perform 1 from public.posting_payments;
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'anon cannot select payments';

  assert (select count(*) from public.postings_list('job', null, null, null, 1)) = 1, 'only the live job is listed';
  assert (select slug from public.postings_list('job', null, null, null, 1)) = 'po-live', 'the live job';
  assert (select postings_count('job', null, null, null)) = 1, 'count matches';
  assert (select count(*) from public.posting_by_slug('job', 'po-past-expiry')) = 0, 'past expiry is hidden at once';
  assert (select count(*) from public.posting_by_slug('job', 'po-closed')) = 0, 'past closing date is hidden';
  assert (select count(*) from public.posting_by_slug('job', 'po-pending')) = 0, 'pending is hidden';
  assert (select count(*) from public.posting_by_slug('classified', 'po-live')) = 0, 'kind must match';
  assert (select count(*) from public.postings_list('classified', 'training', null, 'remote', 1)) = 1, 'classified filters';
  assert (select count(*) from public.postings_list('job', 'part_time', null, null, 1)) = 0, 'type filter';
  assert (select count(*) from public.latest_jobs(4)) = 1, 'latest jobs';
  assert (select count(*) from public.postings_sitemap()) = 2, 'sitemap has live postings only';

  select string_agg(t, ' ') into blob from (
    select row(p.*)::text as t from public.posting_by_slug('job', 'po-live') p
    union all select row(p.*)::text from public.postings_list('job', null, null, null, 1) p
  ) x;
  assert position('secret-a@qa.test' in blob) = 0, 'public functions never return the contact email';

  failed := false;
  begin
    perform public.save_posting(null, 'job', 'Sneaky', 'Org', null, 'Here', null, 'onsite', 'full_time', null,
      null, null, null, null, 'Twenty characters of description.', 'https://x.test', null, null);
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'anon cannot save a posting';
end;
$$;
reset role;
\echo 'ok  anon'

-- Posters ---------------------------------------------------------------------------------

set local request.jwt.claims = '{"role": "authenticated", "sub": "d1700000-0000-4000-8000-0000000000a1"}';
set local role authenticated;

do $$
declare
  failed boolean := false;
  new_id uuid;
begin
  assert (select count(*) from public.postings where id = 'd1700000-0000-4000-8000-0000000000f4') = 0,
    'Alice cannot read Bob''s posting';
  assert (select count(*) from public.postings) = 3, 'Alice reads her own three postings';

  -- No direct write policy for posters.
  update public.postings set status = 'published', expires_at = now() + interval '1 year'
   where id = 'd1700000-0000-4000-8000-0000000000f2';
  assert (select status from public.postings where id = 'd1700000-0000-4000-8000-0000000000f2') = 'published'
     and (select expires_at from public.postings where id = 'd1700000-0000-4000-8000-0000000000f2') < now(),
    'a poster cannot extend their own posting';

  new_id := public.save_posting(null, 'job', 'Research <b>Assistant</b>', 'Lab & Co', 'po-clinic', 'Tulum', 'MX', 'onsite',
    'full_time', null, 50000, 60000, 'USD', 'year', E'We need help.\n\nWith <script>studies</script> & more.',
    'https://example.com/apply', null, current_date + 30);
  assert (select status from public.postings where id = new_id) = 'draft', 'new postings are drafts';
  assert (select slug from public.postings where id = new_id) = 'research-bassistant-b', 'slug from title';
  assert (select title from public.postings where id = new_id) = 'Research bAssistant/b', 'angle brackets removed from the title';
  assert (select description_html from public.postings where id = new_id)
         = '<p>We need help.</p><p>With &lt;script&gt;studies&lt;/script&gt; &amp; more.</p>', 'description is escaped';
  assert (select listing_id from public.postings where id = new_id) = 'd1700000-0000-4000-8000-0000000000c1', 'listing linked';
  assert (select contact_email from public.postings where id = new_id) = 'po.alice@qa.test', 'email from the account';

  -- Editing a draft keeps it a draft; editing a live posting sends it back to review.
  perform public.save_posting(new_id, 'job', 'Research Assistant', 'Lab and Co', null, 'Tulum', 'MX', 'onsite',
    'part_time', null, null, null, null, null, 'We need help with studies and more.', 'https://example.com/apply', null, null);
  assert (select status from public.postings where id = new_id) = 'draft', 'editing a draft keeps it a draft';
  perform public.save_posting('d1700000-0000-4000-8000-0000000000f1', 'job', 'Live Nurse (edited)', 'Clinic A', null, 'Tulum', 'MX',
    'onsite', 'full_time', null, null, null, null, null, 'Edited description text here.', 'https://example.com/a', null, null);
  assert (select status from public.postings where id = 'd1700000-0000-4000-8000-0000000000f1') = 'pending', 'an edited live posting needs review again';

  failed := false;
  begin
    perform public.save_posting('d1700000-0000-4000-8000-0000000000f2', 'job', 'Expired edit', 'Clinic A', null, null, null,
      'remote', 'contract', null, null, null, null, null, 'Trying to edit an expired one.', 'https://example.com/b', null, null);
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'an expired posting must be renewed before editing';

  failed := false;
  begin
    perform public.save_posting('d1700000-0000-4000-8000-0000000000f4', 'job', 'Hijack', 'Clinic B', null, 'Durban', 'ZA',
      'hybrid', 'full_time', null, null, null, null, null, 'Not my posting at all, sorry.', 'https://example.com/d', null, null);
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'a poster cannot edit someone else''s posting';

  failed := false;
  begin
    perform public.save_posting(null, 'classified', 'Bad apply', 'Org', null, null, null, 'remote', null, 'services',
      null, null, null, null, 'Long enough description here.', 'javascript:alert(1)', null, null);
  exception when check_violation then failed := true;
  end;
  assert failed, 'a non-https apply link is rejected';

  failed := false;
  begin
    perform public.approve_posting(new_id, 30);
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'a poster cannot approve';

  failed := false;
  begin
    perform public.apply_posting_payment('cs_fake', new_id, 'd1700000-0000-4000-8000-0000000000a1', 30, 100, 'usd', null);
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'a poster cannot record a payment';
end;
$$;

select public.save_posting(null, 'job', 'Cap ' || g, 'Org', null, 'Here', null, 'onsite', 'full_time', null,
  null, null, null, null, 'Twenty characters of description.', 'https://x.test', null, null)
  from generate_series(1, 9) g;
do $$
declare
  failed boolean := false;
begin
  begin
    perform public.save_posting(null, 'job', 'Cap 11', 'Org', null, 'Here', null, 'onsite', 'full_time', null,
      null, null, null, null, 'Twenty characters of description.', 'https://x.test', null, null);
  exception when sqlstate 'P0001' then failed := true;
  end;
  assert failed, 'the 11th new posting in 24 hours is refused';
end;
$$;
reset role;
\echo 'ok  posters'

-- Payments (service role) -----------------------------------------------------------------

set local role service_role;
do $$
declare
  draft uuid := (select id from public.postings where slug = 'research-bassistant-b');
begin
  assert public.apply_posting_payment('cs_1', draft, 'd1700000-0000-4000-8000-0000000000a1', 30, 4900, 'USD', 'pi_1') = 'pending',
    'paying for a draft sends it to review';
  assert public.apply_posting_payment('cs_1', draft, 'd1700000-0000-4000-8000-0000000000a1', 30, 4900, 'USD', 'pi_1') = 'duplicate',
    'a replay changes nothing';
  assert (select paid_days from public.postings where id = draft) = 30, 'thirty paid days, once';
  assert public.apply_posting_payment('cs_2', draft, 'd1700000-0000-4000-8000-0000000000b1', 30, 4900, 'USD', 'pi_2') = 'no_posting',
    'a payment must come from the poster';
  assert (select count(*) from public.posting_payments where posting_id = draft) = 1, 'one payment row';
  -- Renewing an approved, expired posting puts it straight back up.
  assert public.apply_posting_payment('cs_3', 'd1700000-0000-4000-8000-0000000000f2', 'd1700000-0000-4000-8000-0000000000a1', 60, 7900, 'USD', 'pi_3') = 'renewed',
    'renewal of an approved posting';
  assert (select expires_at from public.postings where id = 'd1700000-0000-4000-8000-0000000000f2') > now() + interval '59 days', 'sixty days from now';
  assert public.expire_postings() = 1, 'the cron expires the posting past its closing date';
  assert (select status from public.postings where id = 'd1700000-0000-4000-8000-0000000000f3') = 'expired', 'closed posting is expired';
end;
$$;
reset role;
\echo 'ok  payments and expiry'

-- Editors ---------------------------------------------------------------------------------

set local request.jwt.claims = '{"role": "authenticated", "sub": "d1700000-0000-4000-8000-0000000000e1"}';
set local role authenticated;
do $$
declare
  draft uuid := (select id from public.postings where slug = 'research-bassistant-b');
  ends timestamptz;
  failed boolean := false;
begin
  ends := public.approve_posting(draft, null);
  assert ends between now() + interval '29 days 23 hours' and now() + interval '30 days 1 hour', 'paid days become the expiry';
  assert (select paid_days from public.postings where id = draft) = 0, 'paid days are used up';
  assert (select count(*) from public.posting_by_slug('job', 'research-bassistant-b')) = 1, 'approved posting is public';

  begin
    perform public.approve_posting('d1700000-0000-4000-8000-0000000000f4', null);
  exception when check_violation then failed := true;
  end;
  assert failed, 'an unpaid posting needs comp days';
  perform public.approve_posting('d1700000-0000-4000-8000-0000000000f4', 14);
  assert (select status from public.postings where id = 'd1700000-0000-4000-8000-0000000000f4') = 'published', 'comp approval';

  -- The edited live posting kept its time.
  perform public.approve_posting('d1700000-0000-4000-8000-0000000000f1', null);
  assert (select expires_at from public.postings where id = 'd1700000-0000-4000-8000-0000000000f1') < now() + interval '30 days',
    'unexpired time is kept on re-approval';
  assert (select count(*) from public.posting_payments) >= 2, 'editors read payments';
  update public.postings set status = 'rejected', reject_reason = 'Unsourced claims'
   where id = 'd1700000-0000-4000-8000-0000000000f5';
  assert (select count(*) from public.posting_by_slug('classified', 'po-training')) = 0, 'rejected is hidden';
end;
$$;
reset role;
\echo 'ok  editors'

rollback;
