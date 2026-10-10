-- supabase/tests/0019_editions.sql — e-editions: visibility (draft, scheduled, early access), ordered stories,
-- and the private PDF bucket.
--
-- Run against a freshly reset local stack (plain psql, not `supabase test db`):
--   npx supabase db reset
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/0019_editions.sql
--
-- One transaction, rolled back.

\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email) values
  ('d1900000-0000-4000-8000-0000000000e1', 'ed.editor@qa.test'),
  ('d1900000-0000-4000-8000-0000000000a1', 'ed.reader@qa.test'),
  ('d1900000-0000-4000-8000-0000000000b1', 'ed.supporter@qa.test');
update public.profiles set role = 'editor' where id = 'd1900000-0000-4000-8000-0000000000e1';
update public.profiles set role = 'supporter' where id = 'd1900000-0000-4000-8000-0000000000b1';
update public.profiles set display_name = 'Second Writer' where id = 'd1900000-0000-4000-8000-0000000000a1';
update public.profiles set display_name = 'First Writer' where id = 'd1900000-0000-4000-8000-0000000000e1';

insert into public.articles (id, site_id, section_id, slug, title, status, published_at, created_by) values
  ('d1900000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101', 'ed-one', 'Story one', 'published', now() - interval '2 days', null),
  ('d1900000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101', 'ed-two', 'Story two', 'published', now() - interval '1 day', null),
  ('d1900000-0000-4000-8000-0000000000f3', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101', 'ed-draft', 'Draft story', 'draft', null, null);

insert into public.article_authors (article_id, profile_id, site_id, sort) values
  ('d1900000-0000-4000-8000-0000000000f1', 'd1900000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001', 1),
  ('d1900000-0000-4000-8000-0000000000f1', 'd1900000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-000000000001', 0);

insert into public.editions (id, site_id, slug, title, issue_month, status, supporters_from, public_from) values
  ('d1900000-0000-4000-8000-000000000c01', '00000000-0000-4000-8000-000000000001', 'ed-live', 'Live issue', '2026-09-01', 'published', now() - interval '10 days', now() - interval '3 days'),
  ('d1900000-0000-4000-8000-000000000c02', '00000000-0000-4000-8000-000000000001', 'ed-early', 'Early issue', '2026-10-01', 'published', now() - interval '1 day', now() + interval '6 days'),
  ('d1900000-0000-4000-8000-000000000c03', '00000000-0000-4000-8000-000000000001', 'ed-draft', 'Draft issue', '2026-11-01', 'draft', null, null),
  ('d1900000-0000-4000-8000-000000000c04', '00000000-0000-4000-8000-000000000001', 'ed-later', 'Later issue', '2026-12-01', 'published', now() + interval '5 days', now() + interval '9 days');

insert into public.edition_items (site_id, edition_id, article_id, sort) values
  ('00000000-0000-4000-8000-000000000001', 'd1900000-0000-4000-8000-000000000c01', 'd1900000-0000-4000-8000-0000000000f2', 0),
  ('00000000-0000-4000-8000-000000000001', 'd1900000-0000-4000-8000-000000000c01', 'd1900000-0000-4000-8000-0000000000f1', 1),
  ('00000000-0000-4000-8000-000000000001', 'd1900000-0000-4000-8000-000000000c01', 'd1900000-0000-4000-8000-0000000000f3', 2),
  ('00000000-0000-4000-8000-000000000001', 'd1900000-0000-4000-8000-000000000c02', 'd1900000-0000-4000-8000-0000000000f1', 0);

-- Constraints ------------------------------------------------------------------------------

do $$
declare
  failed boolean := false;
begin
  begin
    insert into public.editions (site_id, slug, title, issue_month, status)
    values ('00000000-0000-4000-8000-000000000001', 'ed-bad', 'Bad', '2026-09-01', 'published');
  exception when check_violation then failed := true;
  end;
  assert failed, 'a published edition needs a public date';
  failed := false;
  begin
    insert into public.editions (site_id, slug, title, issue_month)
    values ('00000000-0000-4000-8000-000000000001', 'ed-bad', 'Bad', '2026-09-15');
  exception when check_violation then failed := true;
  end;
  assert failed, 'issue month is the first of the month';
  failed := false;
  begin
    insert into public.editions (site_id, slug, title, issue_month, supporters_from, public_from)
    values ('00000000-0000-4000-8000-000000000001', 'ed-bad', 'Bad', '2026-09-01', now() + interval '2 days', now());
  exception when check_violation then failed := true;
  end;
  assert failed, 'supporters cannot get it after the public';
  failed := false;
  begin
    update public.editions set pdf_path = '../etc/passwd' where id = 'd1900000-0000-4000-8000-000000000c01';
  exception when check_violation then failed := true;
  end;
  assert failed, 'pdf path is shaped';
end;
$$;
\echo 'ok  constraints'

-- Anon -------------------------------------------------------------------------------------

set local request.jwt.claims = '{"role": "anon"}';
set local role anon;
do $$
declare
  failed boolean := false;
begin
  begin
    perform 1 from public.editions;
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'anon cannot read editions';
  failed := false;
  begin
    perform 1 from public.edition_items;
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'anon cannot read items';

  assert (select count(*) from public.editions_public()) = 1, 'only the live issue is listed';
  assert (select access from public.editions_public()) = 'public', 'live issue is public';
  assert (select story_count from public.editions_public()) = 2, 'the draft story is not counted';
  assert (select count(*) from public.edition_by_slug('ed-early')) = 0, 'early issue hidden from anon';
  assert (select count(*) from public.edition_by_slug('ed-draft')) = 0, 'draft issue hidden';
  assert (select count(*) from public.edition_by_slug(' ed-live ')) = 1, 'slug is trimmed';

  assert (select count(*) from public.edition_stories('d1900000-0000-4000-8000-000000000c01')) = 2, 'unpublished stories drop out';
  assert (select array_agg(article_slug order by sort) from public.edition_stories('d1900000-0000-4000-8000-000000000c01')) = array['ed-two', 'ed-one'], 'stories in edition order';
  assert (select byline from public.edition_stories('d1900000-0000-4000-8000-000000000c01') where article_slug = 'ed-one') = 'First Writer, Second Writer', 'bylines in author order';
  assert (select count(*) from public.edition_stories('d1900000-0000-4000-8000-000000000c02')) = 0, 'no stories of an early issue for anon';
  assert (select count(*) from public.edition_stories('d1900000-0000-4000-8000-000000000c03')) = 0, 'no stories of a draft';
  assert (select count(*) from storage.objects where bucket_id = 'editions') = 0, 'anon sees no edition files';
end;
$$;
reset role;
\echo 'ok  anon'

-- A plain reader sees what anon sees --------------------------------------------------------

set local request.jwt.claims = '{"role": "authenticated", "sub": "d1900000-0000-4000-8000-0000000000a1"}';
set local role authenticated;
do $$
declare
  failed boolean := false;
begin
  assert (select count(*) from public.editions) = 0, 'readers cannot read the table';
  assert (select count(*) from public.editions_public()) = 1, 'readers get the public list';
  assert (select count(*) from public.edition_by_slug('ed-early')) = 0, 'no early access for readers';
  begin
    insert into storage.objects (bucket_id, name) values ('editions', 'd1900000-0000-4000-8000-000000000c01/1.pdf');
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'readers cannot upload edition files';
end;
$$;
reset role;
\echo 'ok  reader'

-- Supporters get early access --------------------------------------------------------------

set local request.jwt.claims = '{"role": "authenticated", "sub": "d1900000-0000-4000-8000-0000000000b1"}';
set local role authenticated;
do $$
begin
  assert (select count(*) from public.editions_public()) = 2, 'supporters see the early issue too';
  assert (select access from public.edition_by_slug('ed-early')) = 'early', 'flagged as early access';
  assert (select count(*) from public.edition_stories('d1900000-0000-4000-8000-000000000c02')) = 1, 'and its stories';
  assert (select count(*) from public.edition_by_slug('ed-later')) = 0, 'not before supporters_from';
  assert (select count(*) from storage.objects where bucket_id = 'editions') = 0, 'supporters read files through the app only';
end;
$$;
reset role;
\echo 'ok  supporter'

-- Editors manage everything ----------------------------------------------------------------

set local request.jwt.claims = '{"role": "authenticated", "sub": "d1900000-0000-4000-8000-0000000000e1"}';
set local role authenticated;
do $$
begin
  assert (select count(*) from public.editions where slug like 'ed-%') = 4, 'editors read every edition';
  assert (select count(*) from public.edition_items) >= 4, 'editors read items';
  insert into storage.objects (bucket_id, name) values ('editions', 'd1900000-0000-4000-8000-000000000c01/1.pdf');
  update public.editions set pdf_path = 'd1900000-0000-4000-8000-000000000c01/1.pdf', pdf_generated_at = now()
   where id = 'd1900000-0000-4000-8000-000000000c01';
  assert (select count(*) from storage.objects where bucket_id = 'editions') = 1, 'editors read edition files';
  delete from public.edition_items where edition_id = 'd1900000-0000-4000-8000-000000000c02';
  assert (select count(*) from public.edition_by_slug('ed-early')) = 1, 'editors get early access too';
end;
$$;
reset role;
\echo 'ok  editor'

do $$
begin
  assert (select pdf_path from public.edition_by_slug('ed-live')) = 'd1900000-0000-4000-8000-000000000c01/1.pdf', 'pdf path returned';
  assert (select public from storage.buckets where id = 'editions') = false, 'bucket is private';
end;
$$;
\echo 'ok  storage'

rollback;
