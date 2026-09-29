-- supabase/tests/0006_seo.sql — ranked search and old-address redirects.
--
-- Run against a freshly reset local stack (plain psql, not `supabase test db`):
--   npx supabase db reset
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/0006_seo.sql
--
-- One transaction, rolled back. The fixture word is "ibogaine".

\set ON_ERROR_STOP on
begin;

insert into public.articles (id, site_id, section_id, slug, title, dek, status, published_at, scheduled_for, body_html) values
  -- Title match, published earlier than the body match so rank (not date) decides.
  ('a6000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101',
   'seo-title-match', 'Ibogaine trial opens', 'A new study', 'published', now() - interval '3 hours', null,
   '<p>Researchers enrolled the first patients this week in a small observational study.</p>'),
  -- Body-only match, newer. Carries a script tag and entities to prove snippets are plain text.
  ('a6000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000106',
   'seo-body-match', 'Clinic notes from the border', 'A reporter visits', 'published', now() - interval '1 hour', null,
   '<p>Staff at the clinic say demand for ibogaine treatment keeps growing &amp; waiting lists are long, and they want &lt;b&gt;regulation&lt;/b&gt; soon.</p><script>alert("ibogaine")</script>'),
  -- Draft with the word in the title: never returned.
  ('a6000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101',
   'seo-draft', 'Ibogaine draft headline', null, 'draft', null, null, '<p>ibogaine</p>'),
  -- Scheduled in the future: not live yet.
  ('a6000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101',
   'seo-future', 'Ibogaine future headline', null, 'scheduled', null, now() + interval '1 day', '<p>x</p>');

-- As anon ------------------------------------------------------------------------

set local request.jwt.claims = '{"role": "anon"}';
set local role anon;

do $$
declare
  failed boolean;
  titles text[];
  snip text;
begin
  select array_agg(title order by ord) into titles
    from (select title, row_number() over () as ord from public.search_articles('ibogaine', null, 1)) r;
  assert titles = array['Ibogaine trial opens', 'Clinic notes from the border'],
    format('title match ranks above body match, drafts and future stories absent: %s', titles);
  assert public.search_article_count('ibogaine', null) = 2, 'count matches the live results';
  assert public.search_article_count('ibogaine', '') = 2, 'blank section searches every section';

  assert (select count(*) from public.search_articles('ibogaine', 'opinion', 1)) = 1, 'section filter';
  assert (select article_slug from public.search_articles('ibogaine', 'opinion', 1)) = 'seo-body-match', 'section filter keeps the right story';
  assert public.search_article_count('ibogaine', 'opinion') = 1, 'section count';

  assert (select count(*) from public.search_articles('', null, 1)) = 0, 'blank q returns nothing';
  assert (select count(*) from public.search_articles('   ', null, 1)) = 0, 'whitespace q returns nothing';
  assert (select count(*) from public.search_articles(null, null, 1)) = 0, 'null q returns nothing';
  assert public.search_article_count(null, null) = 0, 'null q counts zero';
  assert (select count(*) from public.search_articles('ibogaine', null, 0)) = 0, 'page 0 returns nothing';
  assert (select count(*) from public.search_articles('ibogaine', null, 101)) = 0, 'page 101 returns nothing';
  assert (select count(*) from public.search_articles('ibogaine', null, 2)) = 0, 'page 2 is empty with 2 results';
  assert (select count(*) from public.search_articles('ibogaine' || repeat(' ', 80) || 'zzznomatch', null, 1)) = 2,
    'only the first 80 characters are used';
  assert (select count(*) from public.search_articles('"ibogaine trial" -clinic', null, 1)) = 1, 'websearch syntax';
  assert (select count(*) from public.search_articles('draft headline', null, 1)) = 0, 'draft title never matches';

  select s.snippet into snip from public.search_articles('ibogaine', 'opinion', 1) s;
  assert snip like '%«ibogaine»%', format('snippet highlights the match: %s', snip);
  assert snip not ilike '%<script%' and position('<' in snip) = 0 and position('>' in snip) = 0,
    format('snippet contains no HTML: %s', snip);
  assert snip like '%&%' and snip not like '%&amp;%', format('entities decoded: %s', snip);

  failed := false;
  begin
    perform 1 from public.slug_history;
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'anon cannot select slug_history';

  failed := false;
  begin
    perform 1 from public._live_articles();
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'anon cannot execute _live_articles()';

  failed := false;
  begin
    perform public._search_text('a', 'b', 'c');
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'anon cannot execute _search_text()';
end;
$$;
reset role;
\echo 'ok  search'

-- Old addresses --------------------------------------------------------------------

update public.articles set slug = 'seo-title-renamed' where id = 'a6000000-0000-4000-8000-000000000001';

set local request.jwt.claims = '{"role": "anon"}';
set local role anon;
do $$
begin
  assert public.article_slug_redirect('news', 'seo-title-match') = '/news/seo-title-renamed',
    'renamed live article: old path redirects to the new one';
  assert public.article_slug_redirect_any('seo-title-match') = '/news/seo-title-renamed',
    'legacy lookup by slug alone';
  assert public.article_slug_redirect('news', 'seo-title-renamed') is null, 'current path never redirects';
  assert public.article_slug_redirect('opinion', 'seo-title-match') is null, 'history is per section';
  assert public.article_slug_redirect('news', 'nothing-here') is null, 'unknown path';
end;
$$;
reset role;

-- Rename again and move section: both old paths go straight to the current one.
update public.articles set slug = 'seo-title-final', section_id = '00000000-0000-4000-8000-000000000106'
 where id = 'a6000000-0000-4000-8000-000000000001';

set local request.jwt.claims = '{"role": "anon"}';
set local role anon;
do $$
begin
  assert public.article_slug_redirect('news', 'seo-title-match') = '/opinion/seo-title-final', 'first path: one hop to current';
  assert public.article_slug_redirect('news', 'seo-title-renamed') = '/opinion/seo-title-final', 'second path: one hop to current';
end;
$$;
reset role;

-- Moving back to an old path removes that history row.
update public.articles set slug = 'seo-title-renamed', section_id = '00000000-0000-4000-8000-000000000101'
 where id = 'a6000000-0000-4000-8000-000000000001';
do $$
begin
  assert not exists (select 1 from public.slug_history where section_slug = 'news' and slug = 'seo-title-renamed'),
    'the current path is not kept as history';
end;
$$;

-- A new article reusing an old slug owns it: no redirect.
insert into public.articles (site_id, section_id, slug, title, status, published_at)
values ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101', 'seo-title-match', 'Reused slug', 'draft', null);

set local request.jwt.claims = '{"role": "anon"}';
set local role anon;
do $$
begin
  assert public.article_slug_redirect('news', 'seo-title-match') is null, 'reused slug (even a draft) is not redirected';
  assert public.article_slug_redirect_any('seo-title-match') is null, 'legacy lookup respects the reused slug';
  assert public.article_slug_redirect('opinion', 'seo-title-final') = '/news/seo-title-renamed', 'other old path still works';
end;
$$;
reset role;

-- Unpublishing: old paths stop redirecting.
update public.articles set status = 'draft' where id = 'a6000000-0000-4000-8000-000000000001';

set local request.jwt.claims = '{"role": "anon"}';
set local role anon;
do $$
begin
  assert public.article_slug_redirect('opinion', 'seo-title-final') is null, 'unpublished article: no redirect';
  assert public.article_slug_redirect_any('seo-title-final') is null, 'unpublished article: no legacy redirect';
  assert (select count(*) from public.search_articles('ibogaine', null, 1)) = 1, 'unpublished article leaves search';
end;
$$;
reset role;
\echo 'ok  old addresses'

rollback;
\echo 'ALL 0006 SEO TESTS PASSED'
