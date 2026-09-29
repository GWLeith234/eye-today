-- supabase/tests/0005_frontend.sql — public read functions and view counting.
--
-- Run against a freshly reset local stack (plain psql, not `supabase test db`):
--   npx supabase db reset
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/0005_frontend.sql
--
-- One transaction, rolled back.

\set ON_ERROR_STOP on
begin;

-- Authors: P has a published article, D only a draft.
insert into auth.users (id, email, raw_user_meta_data) values
  ('a5500000-0000-4000-8000-00000000000a', 'pat.published@qa.test', '{"full_name": "Pat Published"}'),
  ('d5500000-0000-4000-8000-00000000000d', 'dee.draft@qa.test', '{"full_name": "Dee Draft"}'),
  ('c5500000-0000-4000-8000-00000000000c', 'pat.clash@qa.test', '{"full_name": "Pat Published"}');

insert into public.disclosures (site_id, profile_id, text) values
  ('00000000-0000-4000-8000-000000000001', 'a5500000-0000-4000-8000-00000000000a', 'No affiliations'),
  ('00000000-0000-4000-8000-000000000001', 'd5500000-0000-4000-8000-00000000000d', 'Paid by Acme');

insert into public.media (id, site_id, storage_path, alt, credit, caption, width, height) values
  ('a5600000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'hero-live.png', 'Live alt', 'Live credit', 'c', 1200, 800),
  ('a5600000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'hero-draft.png', 'Draft alt', 'Draft credit', 'c', 1200, 800);

insert into public.articles (id, site_id, section_id, slug, title, status, published_at, hero_media_id) values
  ('a5700000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101',
   'fe-published', 'Frontend published', 'published', now() - interval '1 hour', 'a5600000-0000-4000-8000-000000000001'),
  ('a5700000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101',
   'fe-draft', 'Frontend draft', 'draft', null, 'a5600000-0000-4000-8000-000000000002');

insert into public.article_authors (article_id, profile_id, site_id) values
  ('a5700000-0000-4000-8000-000000000001', 'a5500000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000001'),
  ('a5700000-0000-4000-8000-000000000002', 'd5500000-0000-4000-8000-00000000000d', '00000000-0000-4000-8000-000000000001');

-- The draft is curated into the lead slot.
insert into public.homepage_slots (site_id, slot, position, article_id)
values ('00000000-0000-4000-8000-000000000001', 'lead', 0, 'a5700000-0000-4000-8000-000000000002');

do $$
begin
  assert (select slug from public.profiles where id = 'a5500000-0000-4000-8000-00000000000a') = 'pat-published',
    'slug from display name';
  assert (select slug from public.profiles where id = 'c5500000-0000-4000-8000-00000000000c') = 'pat-published-c5500000',
    'colliding slug gets the first 8 characters of the id';
  update public.profiles set display_name = 'Renamed Pat' where id = 'a5500000-0000-4000-8000-00000000000a';
  assert (select slug from public.profiles where id = 'a5500000-0000-4000-8000-00000000000a') = 'pat-published',
    'slug does not change when display_name changes';
  update public.profiles set display_name = 'Pat Published' where id = 'a5500000-0000-4000-8000-00000000000a';
end;
$$;
\echo 'ok  profile slugs'

-- As anon -------------------------------------------------------------------------

set local request.jwt.claims = '{"role": "anon"}';
set local role anon;

do $$
declare
  failed boolean;
begin
  assert (select count(*) from public.homepage_public() where title = 'Frontend draft') = 0,
    'homepage_public does not return a draft even when a slot points at it';
  assert (select slot from public.homepage_public() order by slot_position, slot limit 1) = 'lead',
    'the lead slot is filled from live articles instead';
  assert (select count(*) from public.homepage_public()) between 1 and 5, 'lead + up to 4 secondary';

  failed := false;
  begin
    perform 1 from public.profiles;
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'anon cannot select profiles';

  failed := false;
  begin
    perform 1 from public.homepage_slots;
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'anon cannot select homepage_slots';

  failed := false;
  begin
    perform 1 from public._live_articles();
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'anon cannot call the internal _live_articles()';

  assert (select count(*) from public.author_public('pat-published')
          where bio is null and disclosure = 'No affiliations' and display_name = 'Pat Published' and slug = 'pat-published') = 1,
    'author_public returns the published author with their disclosure';
  assert (select count(*) from public.author_public('dee-draft')) = 0, 'no row for a draft-only author';
  assert (select count(*) from public.author_articles('pat-published', 20, 0)) = 1, 'author_articles lists the live article';
  assert public.author_article_count('dee-draft') = 0, 'draft-only author has no public articles';

  assert (select count(*) from public.media where id = 'a5600000-0000-4000-8000-000000000001') = 1,
    'anon reads the hero of a live article';
  assert (select count(*) from public.media where id = 'a5600000-0000-4000-8000-000000000002') = 0,
    'anon cannot read the hero of a draft';

  assert (select count(*) from public.section_articles('news', 20, 0) where title = 'Frontend draft') = 0,
    'section_articles hides drafts';
  assert (select count(*) from public.latest_articles(500, 0)) <= 20, 'latest_articles caps at 20';
  assert (select count(*) from public.most_read(50)) between 1 and 5, 'most_read caps at 5 and falls back to newest';
end;
$$;

reset role;

do $$
begin
  assert not exists (
    select 1
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'author_public'
       and 'email' = any (coalesce(p.proargnames, '{}'::text[]))
  ), 'author_public result columns do not include email';
end;
$$;
\echo 'ok  anon reads'

-- View counting (as anon) ------------------------------------------------------------

set local request.jwt.claims = '{"role": "anon"}';
set local role anon;
select public.record_article_view('a5700000-0000-4000-8000-000000000002', 'hash-one');
select public.record_article_view('a5700000-0000-4000-8000-000000000001', 'hash-one');
select public.record_article_view('a5700000-0000-4000-8000-000000000001', 'hash-one');
select public.record_article_view('a5700000-0000-4000-8000-000000000001', 'hash-two');
select public.record_article_view('a5700000-0000-4000-8000-000000000001', null);
select public.record_article_view('a5700000-0000-4000-8000-000000000001', repeat('x', 65));
reset role;

do $$
begin
  assert (select count(*) from public.article_view_days where article_id = 'a5700000-0000-4000-8000-000000000002') = 0,
    'no view row for a draft';
  assert (select views from public.article_view_days
          where article_id = 'a5700000-0000-4000-8000-000000000001' and day = current_date) = 2,
    'one view per hash per day (hash-one twice + hash-two once = 2)';
  assert (select count(*) from public.article_view_seen where ip_hash in ('hash-one', 'hash-two')) = 2,
    'seen rows only for accepted hashes';
end;
$$;

set local request.jwt.claims = '{"role": "anon"}';
set local role anon;
do $$
declare
  failed boolean := false;
begin
  begin
    perform 1 from public.article_view_days;
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'anon cannot read view counts directly';
  assert (select title from public.most_read(5) limit 1) = 'Frontend published', 'most_read ranks by views';
end;
$$;
reset role;
\echo 'ok  view counting'

rollback;
\echo 'ALL 0005 FRONTEND TESTS PASSED'
