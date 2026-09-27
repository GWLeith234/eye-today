-- supabase/tests/0002_rls.sql — RLS and role checks for migration 0002.
--
-- Run against a freshly reset local stack (plain psql, not `supabase test db`):
--   npx supabase db reset
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/0002_rls.sql
--
-- Everything runs in one transaction and is rolled back. Any failed assertion
-- stops the script with a non-zero exit code.

\set ON_ERROR_STOP on
begin;

-- Users --------------------------------------------------------------------
-- A, B: contributors on eyetoday. Y: the only admin on eyetoday.
-- X: an admin on a second QA site, so it can act on eyetoday's last admin.

insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-4000-8000-00000000000a', 'contributor.a@qa.test', '{"full_name": "Contributor A", "role": "admin"}'),
  ('b0000000-0000-4000-8000-00000000000b', 'contributor.b@qa.test', '{}'),
  ('c0000000-0000-4000-8000-00000000000c', 'admin.x@qa.test', '{"name": "Admin X"}'),
  ('d0000000-0000-4000-8000-00000000000d', 'admin.y@qa.test', '{}');

do $$
begin
  assert (select count(*) from public.profiles
          where id in ('a0000000-0000-4000-8000-00000000000a', 'b0000000-0000-4000-8000-00000000000b',
                       'c0000000-0000-4000-8000-00000000000c', 'd0000000-0000-4000-8000-00000000000d')
            and role = 'reader'
            and site_id = '00000000-0000-4000-8000-000000000001') = 4,
    'signup trigger creates one reader profile per user on eyetoday (metadata role ignored)';
  assert (select display_name from public.profiles where id = 'a0000000-0000-4000-8000-00000000000a') = 'Contributor A',
    'display_name from full_name';
  assert (select display_name from public.profiles where id = 'c0000000-0000-4000-8000-00000000000c') = 'Admin X',
    'display_name from name';
  assert (select display_name from public.profiles where id = 'b0000000-0000-4000-8000-00000000000b') = 'contributor.b',
    'display_name from email local-part';
end;
$$;
\echo 'ok  signup trigger'

-- Roles set as the table owner (the lock trigger allows the owner).
insert into public.sites (id, name, slug)
values ('00000000-0000-4000-8000-0000000000f1', 'QA Site', 'qa-site');

update public.profiles set role = 'contributor'
 where id in ('a0000000-0000-4000-8000-00000000000a', 'b0000000-0000-4000-8000-00000000000b');
update public.profiles set role = 'admin'
 where id = 'd0000000-0000-4000-8000-00000000000d';
update public.profiles set role = 'admin', site_id = '00000000-0000-4000-8000-0000000000f1'
 where id = 'c0000000-0000-4000-8000-00000000000c';

-- Drafts: A authors qa-draft-a, B authors qa-draft-b.
insert into public.articles (id, site_id, section_id, slug, title, status) values
  ('a1000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000101', 'qa-draft-a', 'Draft A', 'draft'),
  ('b1000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000101', 'qa-draft-b', 'Draft B', 'draft');

insert into public.article_authors (article_id, profile_id, site_id) values
  ('a1000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000001'),
  ('b1000000-0000-4000-8000-00000000000b', 'b0000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-000000000001');

-- As contributor A ------------------------------------------------------------

set local request.jwt.claims = '{"sub": "a0000000-0000-4000-8000-00000000000a", "role": "authenticated"}';
set local role authenticated;

update public.articles set title = 'Hacked by A' where id = 'b1000000-0000-4000-8000-00000000000b';
update public.articles set title = 'Draft A edited' where id = 'a1000000-0000-4000-8000-00000000000a';

do $$
declare
  failed boolean := false;
  msg text;
begin
  assert (select count(*) from public.articles where id = 'b1000000-0000-4000-8000-00000000000b') = 0,
    'A cannot see B''s draft';
  assert (select count(*) from public.articles where id = 'a1000000-0000-4000-8000-00000000000a') = 1,
    'A can see own draft';

  begin
    update public.articles set status = 'published', published_at = now()
     where id = 'a1000000-0000-4000-8000-00000000000a';
  exception when insufficient_privilege then
    failed := true;
  end;
  assert failed, 'A cannot publish own draft';

  failed := false;
  begin
    perform public.set_user_role('b0000000-0000-4000-8000-00000000000b', 'editor');
  exception when others then
    failed := true;
    msg := sqlerrm;
  end;
  assert failed and msg = 'not authorized', format('set_user_role refuses a contributor (got %L)', msg);

  failed := false;
  begin
    update public.profiles set role = 'admin' where id = 'a0000000-0000-4000-8000-00000000000a';
  exception when insufficient_privilege then
    failed := true;
  end;
  assert failed, 'A cannot update own role directly';

  update public.profiles set bio = 'Hello from A' where id = 'a0000000-0000-4000-8000-00000000000a';
  update public.profiles set bio = 'Hacked by A' where id = 'b0000000-0000-4000-8000-00000000000b';
end;
$$;

reset role;

do $$
begin
  assert (select title from public.articles where id = 'b1000000-0000-4000-8000-00000000000b') = 'Draft B',
    'B''s draft is unchanged after A''s update';
  assert (select title from public.articles where id = 'a1000000-0000-4000-8000-00000000000a') = 'Draft A edited',
    'A''s own draft changed';
  assert (select status from public.articles where id = 'a1000000-0000-4000-8000-00000000000a') = 'draft',
    'A''s draft is still a draft';
  assert (select bio from public.profiles where id = 'a0000000-0000-4000-8000-00000000000a') = 'Hello from A',
    'A can edit own bio';
  assert (select bio from public.profiles where id = 'b0000000-0000-4000-8000-00000000000b') is null,
    'A cannot edit B''s profile';
  assert (select role from public.profiles where id = 'a0000000-0000-4000-8000-00000000000a') = 'contributor',
    'A''s role is unchanged';
end;
$$;
\echo 'ok  contributor isolation'

-- As admin X ------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "c0000000-0000-4000-8000-00000000000c", "role": "authenticated"}';
set local role authenticated;

do $$
declare
  failed boolean;
  msg text;
begin
  failed := false;
  begin
    perform public.set_user_role('c0000000-0000-4000-8000-00000000000c', 'reader');
  exception when others then
    failed := true;
    msg := sqlerrm;
  end;
  assert failed and msg = 'cannot change own role', format('admin cannot change own role (got %L)', msg);

  failed := false;
  begin
    perform public.set_user_role('d0000000-0000-4000-8000-00000000000d', 'reader');
  exception when others then
    failed := true;
    msg := sqlerrm;
  end;
  assert failed and msg = 'last admin', format('cannot remove the last admin (got %L)', msg);

  failed := false;
  begin
    perform public.set_user_role('e0000000-0000-4000-8000-00000000000e', 'editor');
  exception when others then
    failed := true;
    msg := sqlerrm;
  end;
  assert failed and msg = 'profile not found', format('unknown target is refused (got %L)', msg);

  perform public.set_user_role('a0000000-0000-4000-8000-00000000000a', 'editor');
  perform public.set_user_role('a0000000-0000-4000-8000-00000000000a', 'editor'); -- no-op
end;
$$;

reset role;

do $$
begin
  assert (select role from public.profiles where id = 'a0000000-0000-4000-8000-00000000000a') = 'editor',
    'admin promoted A to editor';
  assert (select role from public.profiles where id = 'd0000000-0000-4000-8000-00000000000d') = 'admin',
    'last admin kept';
  assert (select count(*) from public.audit_log
          where action = 'role.set'
            and entity_id = 'a0000000-0000-4000-8000-00000000000a'
            and actor_id = 'c0000000-0000-4000-8000-00000000000c'
            and site_id = '00000000-0000-4000-8000-000000000001'
            and metadata = '{"old_role": "contributor", "new_role": "editor"}'::jsonb) = 1,
    'exactly one audit row for the change (no-op wrote nothing)';
end;
$$;
\echo 'ok  set_user_role'

-- As service_role (no uid) ------------------------------------------------------

set local request.jwt.claims = '{"role": "service_role"}';
set local role service_role;

do $$
declare
  failed boolean;
begin
  failed := false;
  begin
    perform public.set_user_role('b0000000-0000-4000-8000-00000000000b', 'admin');
  exception when others then
    failed := true;
  end;
  assert failed, 'service_role cannot call set_user_role';

  failed := false;
  begin
    update public.profiles set role = 'admin' where id = 'b0000000-0000-4000-8000-00000000000b';
  exception when others then
    failed := true;
  end;
  assert failed, 'service_role cannot change a role directly';
end;
$$;

reset role;

do $$
begin
  assert (select role from public.profiles where id = 'b0000000-0000-4000-8000-00000000000b') = 'contributor',
    'B''s role is unchanged';
end;
$$;
\echo 'ok  service_role cannot change roles'

-- Anonymous visitors still see only published work ------------------------------

set local request.jwt.claims = '{"role": "anon"}';
set local role anon;

do $$
begin
  assert (select count(*) from public.articles where status <> 'published') = 0,
    'anon sees no drafts';
  assert (select count(*) from public.articles) = 1, 'anon sees the one seeded article';
end;
$$;

reset role;
\echo 'ok  anon'

rollback;
\echo 'ALL 0002 RLS TESTS PASSED'
