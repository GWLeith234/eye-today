-- supabase/tests/0028_podcasts_survey.sql — podcast fields on listings, the reader survey, the newsletter CTA.
--
--   npx supabase db reset
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/0028_podcasts_survey.sql
--
-- One transaction, rolled back.

\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email) values
  ('d2800000-0000-4000-8000-0000000000e1', 'ps.editor@qa.test'),
  ('d2800000-0000-4000-8000-0000000000a1', 'ps.reader@qa.test');
update public.profiles set role = 'editor', display_name = 'Jeff Davis' where id = 'd2800000-0000-4000-8000-0000000000e1';

-- Podcast listing ------------------------------------------------------------------------------

do $$
begin
  assert exists (select 1 from public.sections where site_id = '00000000-0000-4000-8000-000000000001' and slug = 'podcasts'), 'podcasts section seeded';
  assert exists (select 1 from public.directory_categories where site_id = '00000000-0000-4000-8000-000000000001' and slug = 'podcast'), 'podcast category seeded';
end $$;

insert into public.directory_listings (id, site_id, category_id, slug, name, country_code, status, verification_level, verification_note, feed_url, platform_links, host_names)
select 'd2800000-0000-4000-8000-000000000a01', '00000000-0000-4000-8000-000000000001', c.id, 'ps-show', 'PS Show', 'CA', 'published', 'verified', 'Editor knows the host.',
       'https://example.org/feed.xml', '[{"platform":"spotify","url":"https://open.spotify.com/show/x"},{"platform":"apple","url":"https://podcasts.apple.com/x"}]', 'Test Host'
  from public.directory_categories c where c.site_id = '00000000-0000-4000-8000-000000000001' and c.slug = 'podcast';

do $$
declare failed boolean := false;
begin
  begin
    update public.directory_listings set feed_url = 'http://example.org/feed' where slug = 'ps-show';
  exception when check_violation then failed := true;
  end;
  assert failed, 'feed_url must be https';
  failed := false;
  begin
    update public.directory_listings set platform_links = '{"platform":"x"}' where slug = 'ps-show';
  exception when check_violation then failed := true;
  end;
  assert failed, 'platform_links must be an array';
end $$;

set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
do $$
declare r record;
begin
  select * into r from public.directory_listing('ps-show');
  assert r.feed_url = 'https://example.org/feed.xml', 'listing read returns the feed';
  assert pg_catalog.jsonb_array_length(r.platform_links) = 2, 'listing read returns the platforms';
  assert r.host_names = 'Test Host', 'listing read returns the hosts';
  assert (select count(*) from public.directory_platform_links(array['ps-show'])) = 1, 'card read returns the platforms';
end $$;
reset role;
\echo 'ok  podcast listing'

-- Survey ---------------------------------------------------------------------------------------

set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
do $$
declare v_id uuid; failed boolean := false;
begin
  v_id := public.submit_reader_survey('{"brought":"A friend","who":"Press"}', ' Reader@Example.org ', repeat('a', 64));
  assert v_id is not null, 'anon can submit a survey';
  begin
    perform public.submit_reader_survey('[]', null, null);
  exception when invalid_parameter_value then failed := true;
  end;
  assert failed, 'answers must be an object';
  failed := false;
  begin
    perform public.submit_reader_survey(pg_catalog.jsonb_build_object('brought', repeat('x', 1001)), null, null);
  exception when invalid_parameter_value then failed := true;
  end;
  assert failed, 'an answer is at most 1000 characters';
  failed := false;
  begin
    perform * from public.reader_surveys;
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'anon cannot read surveys';
end $$;
reset role;

set local role authenticated;
set local request.jwt.claims = '{"role": "authenticated", "sub": "d2800000-0000-4000-8000-0000000000a1"}';
do $$
begin
  assert (select count(*) from public.reader_surveys) = 0, 'a reader sees no surveys';
end $$;
reset role;

set local role authenticated;
set local request.jwt.claims = '{"role": "authenticated", "sub": "d2800000-0000-4000-8000-0000000000e1"}';
do $$
declare r record;
begin
  select * into r from public.reader_surveys limit 1;
  assert r.email = 'reader@example.org', 'editor reads the response; email is lowercased and trimmed';
  assert r.answers ->> 'who' = 'Press', 'answers are stored as given';
  assert (select display_name from public.newsletter_signoff()) = 'Jeff Davis', 'the signoff is the editor''s display name';
end $$;
reset role;
\echo 'ok  survey'

-- Newsletter CTA -------------------------------------------------------------------------------

do $$
declare failed boolean := false;
begin
  begin
    update public.newsletter_issues set cta_url = 'javascript:alert(1)' where false;
    insert into public.newsletter_issues (site_id, list_id, subject, cta_url)
    select l.site_id, l.id, 'x', 'javascript:alert(1)' from public.newsletter_lists l where l.slug = 'weekly' limit 1;
  exception when check_violation then failed := true;
  end;
  assert failed, 'cta_url must be https';
end $$;
\echo 'ok  newsletter cta'

rollback;
