-- supabase/tests/0012_section_brand.sql — section colour, icon, and public author photos.
--
-- Run against a freshly reset local stack (plain psql, not `supabase test db`):
--   npx supabase db reset
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/0012_section_brand.sql
--
-- One transaction, rolled back.

\set ON_ERROR_STOP on
begin;

update public.sections
   set color = '#1E5B4A',
       icon = 'news'
 where slug = 'news';

do $$
begin
  assert (select color from public.sections where slug = 'news') = '#1E5B4A', 'news keeps a hex colour';
  assert (select icon from public.sections where slug = 'stories') = 'stories', 'seeded stories icon survives';
end;
$$;

do $$
begin
  update public.sections set color = 'green' where slug = 'news';
  raise exception 'a non-hex colour was accepted';
exception
  when check_violation then
    null;
end;
$$;

do $$
begin
  update public.sections set icon = 'News!' where slug = 'news';
  raise exception 'a bad icon name was accepted';
exception
  when check_violation then
    null;
end;
$$;

select avatar_url from public.article_public_bylines('00000000-0000-4000-8000-000000000201');
select article_slug, display_name, avatar_url from public.section_author_faces('opinion', 4);

set local role anon;
select color, icon from public.sections where slug = 'news';
select article_slug from public.section_author_faces('news', 1);

do $$
begin
  update public.sections set color = '#000000' where slug = 'news';
  raise exception 'anon updated a section';
exception
  when insufficient_privilege then
    null;
end;
$$;

rollback;
