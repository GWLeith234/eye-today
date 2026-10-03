-- supabase/tests/0012_section_design.sql — section colour/icon and author photos on public reads.
--
-- Run against a freshly reset local stack (plain psql, not `supabase test db`):
--   npx supabase db reset
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/0012_section_design.sql
--
-- One transaction, rolled back.

\set ON_ERROR_STOP on
begin;

-- The six seeded sections carry their colour and icon.
do $$
begin
  assert (select color from public.sections where slug = 'news') = '#1E5B4A', 'news colour';
  assert (select color from public.sections where slug = 'opinion') = '#3F3F46', 'opinion colour';
  assert (select icon from public.sections where slug = 'research-science') = 'flask', 'research icon';
  assert (select count(*) from public.sections where color is null and slug in
    ('news', 'research-science', 'policy-law', 'treatment-clinics', 'stories', 'opinion')) = 0, 'all six coloured';
end;
$$;

-- Bad values are refused; null is allowed.
savepoint bad_color;
do $$
begin
  begin
    update public.sections set color = 'green' where slug = 'news';
    raise exception 'a non-hex colour was accepted';
  exception when check_violation then null;
  end;
  begin
    update public.sections set color = '#12345' where slug = 'news';
    raise exception 'a short hex colour was accepted';
  exception when check_violation then null;
  end;
  begin
    update public.sections set icon = 'Not An Icon!' where slug = 'news';
    raise exception 'a bad icon slug was accepted';
  exception when check_violation then null;
  end;
  update public.sections set color = null, icon = null where slug = 'news';
end;
$$;
rollback to savepoint bad_color;

-- A published story with an author who has a photo.
insert into auth.users (id, email) values ('a1200000-0000-4000-8000-000000000001', 'photo-author@example.test');
update public.profiles
   set display_name = 'Photo Author', avatar_url = 'https://example.test/a.jpg', slug = 'photo-author'
 where id = 'a1200000-0000-4000-8000-000000000001';

insert into public.articles (id, site_id, section_id, slug, title, status, published_at)
values (
  'a1200000-0000-4000-8000-0000000000a1',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000106',
  'photo-story',
  'Photo story',
  'published',
  now() - interval '1 hour'
);
insert into public.article_authors (article_id, profile_id, site_id, sort)
values ('a1200000-0000-4000-8000-0000000000a1', 'a1200000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 0);

set local role anon;

do $$
begin
  assert (select avatar_url from public.article_public_bylines('a1200000-0000-4000-8000-0000000000a1')) = 'https://example.test/a.jpg',
    'bylines carry the photo';
  assert (select avatar_url from public.author_public('photo-author')) = 'https://example.test/a.jpg', 'author page carries the photo';
  assert (select author_slug from public.card_authors('opinion', array['photo-story', 'missing'])) = 'photo-author', 'card author';
  assert (select count(*) from public.card_authors('news', array['photo-story'])) = 0, 'wrong section returns nothing';
end;
$$;

reset role;

-- A draft story never appears, even by slug.
update public.articles set status = 'draft' where id = 'a1200000-0000-4000-8000-0000000000a1';
set local role anon;
do $$
begin
  assert (select count(*) from public.card_authors('opinion', array['photo-story'])) = 0, 'draft is hidden';
  assert (select count(*) from public.article_public_bylines('a1200000-0000-4000-8000-0000000000a1')) = 0, 'draft bylines hidden';
end;
$$;
reset role;

rollback;
