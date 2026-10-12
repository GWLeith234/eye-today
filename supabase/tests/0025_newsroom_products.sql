-- supabase/tests/0025_newsroom_products.sql — news feed, legal map, tracker and issue numbers.
--
-- Run against a freshly reset local stack (plain psql, not `supabase test db`):
--   npx supabase db reset
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/0025_newsroom_products.sql
--
-- One transaction, rolled back.

\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email) values
  ('d2500000-0000-4000-8000-0000000000e1', 'np.editor@qa.test'),
  ('d2500000-0000-4000-8000-0000000000a1', 'np.reader@qa.test');
update public.profiles set role = 'editor' where id = 'd2500000-0000-4000-8000-0000000000e1';

insert into public.articles (id, site_id, section_id, slug, title, status, published_at) values
  ('d2500000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101', 'np-live', 'Live story', 'published', now() - interval '1 day'),
  ('d2500000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101', 'np-draft', 'Draft story', 'draft', null);

-- News links ---------------------------------------------------------------------------------

insert into public.news_links (id, site_id, url, title, source_name, published_on, blurb, tags, status) values
  ('d2500000-0000-4000-8000-000000000a01', '00000000-0000-4000-8000-000000000001', 'https://example.org/one', 'Published one', 'Example Times', '2026-10-09', 'Short blurb.', '{texas}', 'published'),
  ('d2500000-0000-4000-8000-000000000a02', '00000000-0000-4000-8000-000000000001', 'https://example.org/two', 'Published two', 'Example Post', '2026-10-10', '', '{}', 'published'),
  ('d2500000-0000-4000-8000-000000000a03', '00000000-0000-4000-8000-000000000001', 'https://example.org/draft', 'Draft link', 'Example Post', '2026-10-11', '', '{}', 'draft');

do $$
declare
  failed boolean := false;
begin
  begin
    insert into public.news_links (site_id, url, title, source_name, published_on)
    values ('00000000-0000-4000-8000-000000000001', 'http://example.org/plain', 'Plain', 'X', '2026-10-01');
  exception when check_violation then failed := true;
  end;
  assert failed, 'news links must be https';
  failed := false;
  begin
    insert into public.news_links (site_id, url, title, source_name, published_on, blurb)
    values ('00000000-0000-4000-8000-000000000001', 'https://example.org/long', 'Long', 'X', '2026-10-01', repeat('x', 281));
  exception when check_violation then failed := true;
  end;
  assert failed, 'blurb is at most 280 characters';
  failed := false;
  begin
    insert into public.news_links (site_id, url, title, source_name, published_on)
    values ('00000000-0000-4000-8000-000000000001', 'https://example.org/one', 'Dup', 'X', '2026-10-01');
  exception when unique_violation then failed := true;
  end;
  assert failed, 'a url is listed once per site';
end $$;
\echo 'ok  news link constraints'

set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
do $$
declare
  n integer;
  first text;
begin
  select count(*) into n from public.news_links_public(1, 20);
  assert n = 2, 'anon sees the two published links, got ' || n;
  select title into first from public.news_links_public(1, 20) limit 1;
  assert first = 'Published two', 'newest first, got ' || first;
  assert public.news_links_count() = 2, 'count matches';
  assert (select count(*) from public.news_links_public(2, 1)) = 1, 'page 2 of 1 per page has one row';
end $$;
do $$
declare failed boolean := false;
begin
  begin
    perform * from public.news_links;
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'anon has no table access to news_links';
end $$;
reset role;
\echo 'ok  news links public reads'

set local role authenticated;
set local request.jwt.claims = '{"role": "authenticated", "sub": "d2500000-0000-4000-8000-0000000000a1"}';
do $$
declare n integer;
begin
  select count(*) into n from public.news_links;
  assert n = 0, 'a reader sees no news_links rows under RLS';
end $$;
reset role;

set local role authenticated;
set local request.jwt.claims = '{"role": "authenticated", "sub": "d2500000-0000-4000-8000-0000000000e1"}';
do $$
declare n integer;
begin
  select count(*) into n from public.news_links;
  assert n = 3, 'an editor sees every row';
  update public.news_links set status = 'published' where id = 'd2500000-0000-4000-8000-000000000a03';
  get diagnostics n = row_count;
  assert n = 1, 'an editor can publish';
end $$;
reset role;
\echo 'ok  news links rls'

-- Legal map ----------------------------------------------------------------------------------

update public.country_legal_status
   set title = 'Legal and unregulated', summary_html = '<p>Yes.</p>', sources = '[{"title":"Gov","url":"https://example.org/mx"}]',
       as_of = '2026-10-01', status = 'published', legal_category = 'unregulated'
 where site_id = '00000000-0000-4000-8000-000000000001' and country_code = 'MX';
update public.country_legal_status
   set title = 'Prohibited', summary_html = '<p>No.</p>', sources = '[]', as_of = '2026-09-01', status = 'published', legal_category = 'prohibited'
 where site_id = '00000000-0000-4000-8000-000000000001' and country_code = 'US';

do $$
declare failed boolean := false;
begin
  begin
    update public.country_legal_status set legal_category = 'maybe' where country_code = 'CA';
  exception when check_violation then failed := true;
  end;
  assert failed, 'legal_category is one of the five';
end $$;

set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
do $$
declare n integer; sc integer;
begin
  select count(*) into n from public.legal_map_public();
  assert n = 2, 'legal map lists the two published countries, got ' || n;
  select source_count into sc from public.legal_map_public() where country_code = 'MX';
  assert sc = 1, 'source count comes from the sources array';
  assert (select legal_category from public.legal_map_public() where country_code = 'US') = 'prohibited', 'category passes through';
end $$;
reset role;
\echo 'ok  legal map'

-- Tracker -------------------------------------------------------------------------------------

insert into public.tracker_entries (site_id, slug, kind, title, status, article_id) values
  ('00000000-0000-4000-8000-000000000001', 'np-trial', 'trial', 'Trial with live story', 'published', 'd2500000-0000-4000-8000-0000000000f1'),
  ('00000000-0000-4000-8000-000000000001', 'np-funding', 'funding', 'Funding with draft story', 'published', 'd2500000-0000-4000-8000-0000000000f2'),
  ('00000000-0000-4000-8000-000000000001', 'np-hidden', 'regulatory', 'Hidden draft entry', 'draft', null);

do $$
declare failed boolean := false;
begin
  begin
    insert into public.tracker_entries (site_id, slug, kind, title) values ('00000000-0000-4000-8000-000000000001', 'np-bad', 'rumour', 'Bad');
  exception when check_violation then failed := true;
  end;
  assert failed, 'kind is trial, funding or regulatory';
end $$;

set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
do $$
declare n integer;
begin
  select count(*) into n from public.tracker_public(null) where slug like 'np-%';
  assert n = 2, 'anon sees the published test entries, got ' || n;
  assert (select article_slug from public.tracker_public('trial') where slug = 'np-trial') = 'np-live', 'a live linked story is returned';
  assert (select article_slug from public.tracker_public('funding') where slug = 'np-funding') is null, 'a draft linked story is not';
  assert (select count(*) from public.tracker_public('regulatory') where slug like 'np-%') = 0, 'kind filter applies';
  assert (select count(*) from public.tracker_public(null)) >= 7, 'the seed is present';
end $$;
do $$
declare failed boolean := false;
begin
  begin
    perform * from public.tracker_entries;
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'anon has no table access to tracker_entries';
end $$;
reset role;
\echo 'ok  tracker'

-- Issue numbers -------------------------------------------------------------------------------

insert into public.editions (id, site_id, slug, title, issue_month, status, public_from) values
  ('d2500000-0000-4000-8000-000000000c01', '00000000-0000-4000-8000-000000000001', 'np-oct', 'October', '2026-10-01', 'published', now() - interval '1 day'),
  ('d2500000-0000-4000-8000-000000000c02', '00000000-0000-4000-8000-000000000001', 'np-nov', 'November', '2026-11-01', 'draft', null);

do $$
declare a integer; b integer;
begin
  select issue_number into a from public.editions where id = 'd2500000-0000-4000-8000-000000000c01';
  select issue_number into b from public.editions where id = 'd2500000-0000-4000-8000-000000000c02';
  assert a is not null and b = a + 1, 'editions number up on insert: ' || coalesce(a::text, 'null') || ', ' || coalesce(b::text, 'null');
end $$;

do $$
declare failed boolean := false;
begin
  begin
    update public.editions set issue_number = (select issue_number from public.editions where id = 'd2500000-0000-4000-8000-000000000c01')
     where id = 'd2500000-0000-4000-8000-000000000c02';
  exception when unique_violation then failed := true;
  end;
  assert failed, 'issue numbers are unique per site';
end $$;

set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
do $$
declare n integer;
begin
  select issue_number into n from public.editions_public() where slug = 'np-oct';
  assert n is not null, 'editions_public carries the number';
  select issue_number into n from public.edition_by_slug('np-oct');
  assert n is not null, 'edition_by_slug carries the number';
end $$;
reset role;

insert into public.newsletter_issues (id, site_id, list_id, subject)
select 'd2500000-0000-4000-8000-000000000b01', l.site_id, l.id, 'First' from public.newsletter_lists l where l.site_id = '00000000-0000-4000-8000-000000000001' and l.slug = 'weekly';
insert into public.newsletter_issues (id, site_id, list_id, subject)
select 'd2500000-0000-4000-8000-000000000b02', l.site_id, l.id, 'Second' from public.newsletter_lists l where l.site_id = '00000000-0000-4000-8000-000000000001' and l.slug = 'weekly';

do $$
declare a integer; b integer;
begin
  select issue_number into a from public.newsletter_issues where id = 'd2500000-0000-4000-8000-000000000b01';
  select issue_number into b from public.newsletter_issues where id = 'd2500000-0000-4000-8000-000000000b02';
  assert a is not null and b = a + 1, 'newsletter issues number up per list';
  assert (select include_news from public.newsletter_issues where id = 'd2500000-0000-4000-8000-000000000b01') = false, 'include_news defaults off';
end $$;
\echo 'ok  issue numbers'

rollback;
