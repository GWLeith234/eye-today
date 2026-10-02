-- supabase/tests/0011_slug_redirect_fix.sql — section moves keep the old URL.
--
-- Run against a freshly reset local stack (plain psql, not `supabase test db`):
--   npx supabase db reset
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/0011_slug_redirect_fix.sql
--
-- One transaction, rolled back.

\set ON_ERROR_STOP on
begin;

insert into public.articles (id, site_id, section_id, slug, title, status, published_at)
values (
  'a1100000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000101',
  'section-move-story',
  'Section move story',
  'published',
  now() - interval '1 hour'
);

-- Same slug, new section. 0006 records /news/section-move-story in slug_history.
update public.articles
   set section_id = '00000000-0000-4000-8000-000000000106'
 where id = 'a1100000-0000-4000-8000-000000000001';

do $$
begin
  assert exists (
    select 1 from public.slug_history
     where section_slug = 'news' and slug = 'section-move-story'
       and article_id = 'a1100000-0000-4000-8000-000000000001'
  ), 'moving sections writes the old /section/slug into slug_history';
end;
$$;

set local request.jwt.claims = '{"role": "anon"}';
set local role anon;
do $$
begin
  assert public.article_slug_redirect('news', 'section-move-story') = '/opinion/section-move-story',
    'the old section URL redirects to the current path';
  assert public.article_slug_redirect('opinion', 'section-move-story') is null,
    'the current path never redirects';
  assert public.article_slug_redirect_any('section-move-story') is null,
    'the slug is still current, so the legacy lookup does not treat it as vacated';
end;
$$;
reset role;

rollback;
\echo 'ALL 0011 SLUG REDIRECT TESTS PASSED'
