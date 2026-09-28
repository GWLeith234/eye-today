-- supabase/tests/0003_cms.sql — CMS policies and publish_due_articles().
--
-- Run against a freshly reset local stack (plain psql, not `supabase test db`):
--   npx supabase db reset
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/0003_cms.sql
--
-- One transaction, rolled back. now() is fixed for the whole transaction, so
-- "past" and "future" below are relative to the same instant the policies see.

\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email) values
  ('e0000000-0000-4000-8000-00000000000e', 'editor.e@qa.test'),
  ('c0000000-0000-4000-8000-00000000000c', 'contributor.c@qa.test');

update public.profiles set role = 'editor' where id = 'e0000000-0000-4000-8000-00000000000e';
update public.profiles set role = 'contributor' where id = 'c0000000-0000-4000-8000-00000000000c';

-- As the editor --------------------------------------------------------------

set local request.jwt.claims = '{"sub": "e0000000-0000-4000-8000-00000000000e", "role": "authenticated"}';
set local role authenticated;

insert into public.articles (id, site_id, section_id, slug, title, status)
values ('d1000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000101', 'cms-draft', 'CMS draft', 'draft');

insert into public.articles (id, site_id, section_id, slug, title, status, scheduled_for) values
  ('d1000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000101', 'cms-due', 'Due scheduled', 'scheduled', now() - interval '1 minute'),
  ('d1000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000101', 'cms-future', 'Future scheduled', 'scheduled', now() + interval '1 hour');

insert into public.tags (id, site_id, slug, name)
values ('d2000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'glaucoma', 'Glaucoma');
insert into public.article_tags (article_id, tag_id, site_id)
values ('d1000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001');
insert into public.article_authors (article_id, profile_id, site_id)
values ('d1000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-00000000000c', '00000000-0000-4000-8000-000000000001');

do $$
declare
  failed boolean;
begin
  assert (select count(*) from public.articles where slug like 'cms-%') = 3, 'editor sees own new articles';
  assert (select count(*) from public.profiles
          where id in ('e0000000-0000-4000-8000-00000000000e', 'c0000000-0000-4000-8000-00000000000c')) = 2,
    'editor can read other profiles for the author picker';

  failed := false;
  begin
    insert into public.articles (site_id, section_id, slug, title, status)
    values ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101',
            'cms-archived', 'Archived on insert', 'archived');
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'editor cannot insert with a status outside draft/scheduled/published';

  failed := false;
  begin
    update public.profiles set role = 'admin' where id = 'c0000000-0000-4000-8000-00000000000c';
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'editor cannot change a role';

  failed := false;
  begin
    perform public.publish_due_articles();
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'editor cannot execute publish_due_articles';

  failed := false;
  begin
    delete from public.articles where id = 'd1000000-0000-4000-8000-000000000001';
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'editor cannot delete articles';
end;
$$;

reset role;
\echo 'ok  editor writes'

-- As anon --------------------------------------------------------------------

set local request.jwt.claims = '{"role": "anon"}';
set local role anon;

do $$
begin
  assert (select count(*) from public.articles where slug = 'cms-draft') = 0, 'anon cannot see the draft';
  assert (select count(*) from public.articles where slug = 'cms-due') = 1, 'anon sees a scheduled article once due';
  assert (select count(*) from public.articles where slug = 'cms-future') = 0, 'anon cannot see a scheduled article early';
  assert (select count(*) from public.tags where slug = 'glaucoma') = 1, 'anon can read tags';
end;
$$;

reset role;
\echo 'ok  anon visibility'

-- As the contributor -----------------------------------------------------------

set local request.jwt.claims = '{"sub": "c0000000-0000-4000-8000-00000000000c", "role": "authenticated"}';
set local role authenticated;

do $$
declare
  failed boolean;
begin
  failed := false;
  begin
    -- Since 0004 contributors may insert their own drafts, but never a published article.
    insert into public.articles (site_id, section_id, slug, title, status, published_at)
    values ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101',
            'cms-by-contributor', 'Contributor article', 'published', now());
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'contributor cannot insert a published article';

  failed := false;
  begin
    insert into public.article_tags (article_id, tag_id, site_id)
    values ('d1000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001',
            '00000000-0000-4000-8000-000000000001');
  exception when insufficient_privilege or unique_violation then failed := true;
  end;
  assert failed, 'contributor cannot tag articles';

  failed := false;
  begin
    insert into public.sections (site_id, slug, name)
    values ('00000000-0000-4000-8000-000000000001', 'cms-section', 'CMS section');
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'contributor cannot create sections';
end;
$$;

reset role;
\echo 'ok  contributor limits'

-- publish_due_articles as service_role ----------------------------------------------

set local request.jwt.claims = '{"role": "service_role"}';
set local role service_role;

do $$
begin
  assert public.publish_due_articles() = 1, 'publish_due_articles publishes exactly the one due row';
  assert public.publish_due_articles() = 0, 'second run publishes nothing';
end;
$$;

reset role;

do $$
begin
  assert (select status from public.articles where slug = 'cms-due') = 'published', 'due row is published';
  assert (select published_at = scheduled_for from public.articles where slug = 'cms-due'), 'published_at = scheduled_for';
  assert (select status from public.articles where slug = 'cms-future') = 'scheduled', 'future row still scheduled';
  assert (select status from public.articles where slug = 'cms-draft') = 'draft', 'draft untouched';
  assert (select status from public.articles where slug = 'welcome-to-eye-today') = 'published', 'seed article untouched';
end;
$$;
\echo 'ok  publish_due_articles'

rollback;
\echo 'ALL 0003 CMS TESTS PASSED'
