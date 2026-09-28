-- supabase/tests/0004_contributors.sql — contributor workflow policies and helpers.
--
-- Run against a freshly reset local stack (plain psql, not `supabase test db`):
--   npx supabase db reset
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/0004_contributors.sql
--
-- One transaction, rolled back.

\set ON_ERROR_STOP on
begin;

-- Users: contributors A and B, editor E, reader R.
insert into auth.users (id, email, raw_user_meta_data) values
  ('a4000000-0000-4000-8000-00000000000a', 'contrib.a@qa.test', '{"full_name": "Alex Author"}'),
  ('b4000000-0000-4000-8000-00000000000b', 'contrib.b@qa.test', '{"full_name": "Bo Writer"}'),
  ('e4000000-0000-4000-8000-00000000000e', 'editor.e@qa.test', '{"full_name": "Eden Editor"}'),
  ('f4000000-0000-4000-8000-00000000000f', 'reader.r@qa.test', '{"full_name": "Riley Reader"}');

update public.profiles set role = 'contributor'
 where id in ('a4000000-0000-4000-8000-00000000000a', 'b4000000-0000-4000-8000-00000000000b');
update public.profiles set role = 'editor' where id = 'e4000000-0000-4000-8000-00000000000e';

do $$
begin
  assert (select email from public.profiles where id = 'a4000000-0000-4000-8000-00000000000a') = 'contrib.a@qa.test',
    'profiles.email filled on signup';
end;
$$;
update auth.users set email = 'alex.new@qa.test' where id = 'a4000000-0000-4000-8000-00000000000a';
do $$
begin
  assert (select email from public.profiles where id = 'a4000000-0000-4000-8000-00000000000a') = 'alex.new@qa.test',
    'profiles.email follows auth.users email changes';
end;
$$;
\echo 'ok  profiles.email sync'

-- B's draft, created as the table owner.
insert into public.articles (id, site_id, section_id, slug, title, status, created_by) values
  ('b5000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000101', 'contrib-b-draft', 'Draft B', 'draft', 'b4000000-0000-4000-8000-00000000000b');
insert into public.article_authors (article_id, profile_id, site_id) values
  ('b5000000-0000-4000-8000-00000000000b', 'b4000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-000000000001');

-- As contributor A --------------------------------------------------------------

set local request.jwt.claims = '{"sub": "a4000000-0000-4000-8000-00000000000a", "role": "authenticated"}';
set local role authenticated;

insert into public.articles (id, site_id, section_id, slug, title, status, created_by)
values ('a5000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000101', 'contrib-a-draft', 'Draft A', 'draft', 'a4000000-0000-4000-8000-00000000000a');
insert into public.article_authors (article_id, profile_id, site_id)
values ('a5000000-0000-4000-8000-00000000000a', 'a4000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000001');

do $$
declare
  failed boolean;
  bad text;
  n integer;
begin
  assert (select count(*) from public.articles where id = 'a5000000-0000-4000-8000-00000000000a') = 1,
    'contributor can read own new draft';
  assert (select count(*) from public.article_authors where article_id = 'a5000000-0000-4000-8000-00000000000a') = 1,
    'contributor can read own author row';

  -- cannot insert published / sponsored / as someone else
  failed := false;
  begin
    insert into public.articles (site_id, section_id, slug, title, status, published_at, created_by)
    values ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101',
            'contrib-a-pub', 'Published by A', 'published', now(), 'a4000000-0000-4000-8000-00000000000a');
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'contributor cannot insert status published';

  failed := false;
  begin
    insert into public.articles (site_id, section_id, slug, title, status, created_by)
    values ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101',
            'contrib-a-other', 'As B', 'draft', 'b4000000-0000-4000-8000-00000000000b');
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'contributor cannot insert with someone else as created_by';

  -- cannot touch B's draft
  update public.articles set title = 'Hacked' where id = 'b5000000-0000-4000-8000-00000000000b';
  get diagnostics n = row_count;
  assert n = 0, 'contributor cannot update another person''s draft';

  failed := false;
  begin
    insert into public.article_authors (article_id, profile_id, site_id)
    values ('b5000000-0000-4000-8000-00000000000b', 'a4000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000001');
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'contributor cannot add themselves to another person''s draft';

  -- cannot move own draft to published / scheduled / in_review
  foreach bad in array array['published', 'scheduled', 'in_review'] loop
    failed := false;
    begin
      execute format(
        'update public.articles set status = %L, published_at = now(), scheduled_for = now() where id = %L',
        bad, 'a5000000-0000-4000-8000-00000000000a');
    exception when insufficient_privilege then failed := true;
    end;
    assert failed, format('contributor cannot set own draft to %s', bad);
  end loop;

  -- cannot sponsor
  failed := false;
  begin
    update public.articles set is_sponsored = true, sponsor_name = 'X' where id = 'a5000000-0000-4000-8000-00000000000a';
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'contributor cannot mark a draft sponsored';

  -- no author deletes
  delete from public.article_authors where article_id = 'a5000000-0000-4000-8000-00000000000a';
  get diagnostics n = row_count;
  assert n = 0, 'contributor cannot delete author rows';

  -- submit without a disclosure: the trigger refuses
  failed := false;
  begin
    update public.articles set status = 'submitted' where id = 'a5000000-0000-4000-8000-00000000000a';
  exception when others then
    failed := sqlerrm = 'disclosure required';
  end;
  assert failed, 'submitting without a disclosure raises';

  -- blank disclosure is refused, "No affiliations" is fine
  failed := false;
  begin
    insert into public.disclosures (site_id, profile_id, text)
    values ('00000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-00000000000a', '   ');
  exception when check_violation then failed := true;
  end;
  assert failed, 'blank disclosure refused';

  insert into public.disclosures (site_id, profile_id, text)
  values ('00000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-00000000000a', 'No affiliations');

  update public.articles set status = 'submitted' where id = 'a5000000-0000-4000-8000-00000000000a';
  get diagnostics n = row_count;
  assert n = 1, 'submitting succeeds once a disclosure exists';

  -- once submitted, no more contributor updates
  update public.articles set title = 'Edited after submit' where id = 'a5000000-0000-4000-8000-00000000000a';
  get diagnostics n = row_count;
  assert n = 0, 'contributor cannot update a submitted row';
  assert (select status from public.articles where id = 'a5000000-0000-4000-8000-00000000000a') = 'submitted',
    'contributor still sees the submitted story';

  -- grant_contributor is editor-only
  failed := false;
  begin
    perform public.grant_contributor('f4000000-0000-4000-8000-00000000000f');
  exception when others then failed := sqlerrm = 'not authorized';
  end;
  assert failed, 'contributor calling grant_contributor raises';

  assert (select count(*) from public.editor_emails()) = 1, 'contributor can list editor emails';
  assert (select count(*) from public.profiles) = 1, 'contributor still reads only their own profile';
end;
$$;

reset role;
\echo 'ok  contributor limits'

-- Disclosure uniqueness -------------------------------------------------------------

do $$
declare
  failed boolean := false;
begin
  begin
    insert into public.disclosures (site_id, profile_id, text)
    values ('00000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-00000000000a', 'Second');
  exception when unique_violation then failed := true;
  end;
  assert failed, 'one disclosure per profile';
end;
$$;

-- As anon: applications and bylines ------------------------------------------------

-- Publish A's story (as the owner) so bylines are public.
update public.articles set status = 'published', published_at = now() - interval '1 minute'
 where id = 'a5000000-0000-4000-8000-00000000000a';

set local request.jwt.claims = '{"role": "anon"}';
set local role anon;

insert into public.contributor_applications (name, email, bio)
values ('Pat Applicant', 'pat@qa.test', 'Optometrist');

do $$
declare
  failed boolean;
begin
  failed := false;
  begin
    perform 1 from public.contributor_applications;
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'anon cannot select applications';

  failed := false;
  begin
    insert into public.contributor_applications (name, email, status) values ('Sneaky', 'sneaky@qa.test', 'approved');
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'anon cannot insert an approved application';

  failed := false;
  begin
    insert into public.contributor_applications (name, email) values ('Pat again', 'PAT@qa.test');
  exception when unique_violation then failed := true;
  end;
  assert failed, 'one pending application per email (case-insensitive)';

  assert (select count(*) from public.article_bylines('a5000000-0000-4000-8000-00000000000a')
          where display_name = 'Alex Author' and disclosure = 'No affiliations') = 1,
    'anon bylines show the disclosure on a published article';
  assert (select count(*) from public.article_bylines('b5000000-0000-4000-8000-00000000000b')) = 0,
    'anon bylines return nothing for a draft';
end;
$$;

reset role;

do $$
begin
  assert (select site_id from public.contributor_applications where email = 'pat@qa.test') = '00000000-0000-4000-8000-000000000001',
    'application gets the eyetoday site';
  -- rate limit: three in 24 hours per email
  update public.contributor_applications set status = 'rejected' where email = 'pat@qa.test';
  insert into public.contributor_applications (name, email, status) values ('Pat 2', 'pat@qa.test', 'rejected');
  insert into public.contributor_applications (name, email, status) values ('Pat 3', 'pat@qa.test', 'rejected');
end;
$$;

set local request.jwt.claims = '{"role": "anon"}';
set local role anon;
do $$
declare
  failed boolean := false;
begin
  begin
    insert into public.contributor_applications (name, email) values ('Pat 4', 'pat@qa.test');
  exception when others then failed := sqlerrm = 'too many applications';
  end;
  assert failed, 'fourth application in 24 hours is refused';
end;
$$;
reset role;
\echo 'ok  applications and bylines'

-- As editor E ---------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "e4000000-0000-4000-8000-00000000000e", "role": "authenticated"}';
set local role authenticated;

do $$
declare
  failed boolean;
begin
  assert (select count(*) from public.contributor_applications) = 3, 'editor reads applications';
  assert public.profile_id_for_email(' READER.R@qa.test ') = 'f4000000-0000-4000-8000-00000000000f',
    'profile_id_for_email is case- and space-insensitive';

  perform public.grant_contributor('f4000000-0000-4000-8000-00000000000f');
  perform public.grant_contributor('f4000000-0000-4000-8000-00000000000f'); -- already contributor: no-op

  failed := false;
  begin
    perform public.grant_contributor('e4000000-0000-4000-8000-00000000000e');
  exception when others then failed := sqlerrm = 'role not grantable';
  end;
  assert failed, 'grant_contributor refuses an editor target';

  insert into public.editorial_notes (site_id, article_id, author_id, body)
  values ('00000000-0000-4000-8000-000000000001', 'b5000000-0000-4000-8000-00000000000b',
          'e4000000-0000-4000-8000-00000000000e', 'Please add sources.');
end;
$$;

reset role;

do $$
begin
  assert (select role from public.profiles where id = 'f4000000-0000-4000-8000-00000000000f') = 'contributor',
    'grant_contributor turned the reader into a contributor';
  assert (select count(*) from public.audit_log
          where action = 'role.contributor' and entity_id = 'f4000000-0000-4000-8000-00000000000f'
            and actor_id = 'e4000000-0000-4000-8000-00000000000e') = 1,
    'exactly one audit row for the grant';
end;
$$;
\echo 'ok  editor helpers'

-- Notes visibility: B sees notes on B's story, A does not ---------------------------------

set local request.jwt.claims = '{"sub": "b4000000-0000-4000-8000-00000000000b", "role": "authenticated"}';
set local role authenticated;
do $$
declare
  failed boolean := false;
begin
  assert (select count(*) from public.editorial_notes) = 1, 'author reads notes on their story';
  begin
    insert into public.editorial_notes (site_id, article_id, author_id, body)
    values ('00000000-0000-4000-8000-000000000001', 'b5000000-0000-4000-8000-00000000000b',
            'b4000000-0000-4000-8000-00000000000b', 'Self note');
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'contributors cannot write notes';
end;
$$;
reset role;

set local request.jwt.claims = '{"sub": "a4000000-0000-4000-8000-00000000000a", "role": "authenticated"}';
set local role authenticated;
do $$
begin
  assert (select count(*) from public.editorial_notes) = 0, 'other contributors cannot read the notes';
end;
$$;
reset role;
\echo 'ok  editorial notes'

rollback;
\echo 'ALL 0004 CONTRIBUTOR TESTS PASSED'
