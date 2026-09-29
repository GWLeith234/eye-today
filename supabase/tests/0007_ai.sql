-- supabase/tests/0007_ai.sql — ai_suggestions access.
--
-- Run against a freshly reset local stack (plain psql, not `supabase test db`):
--   npx supabase db reset
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/0007_ai.sql
--
-- One transaction, rolled back.

\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('a7000000-0000-4000-8000-00000000000e', 'ai.editor@qa.test', '{"full_name": "Ada Editor"}'),
  ('a7000000-0000-4000-8000-00000000000f', 'ai.editor2@qa.test', '{"full_name": "Eli Editor"}'),
  ('a7000000-0000-4000-8000-00000000000c', 'ai.contrib@qa.test', '{"full_name": "Cam Contributor"}');
update public.profiles set role = 'editor'
 where id in ('a7000000-0000-4000-8000-00000000000e', 'a7000000-0000-4000-8000-00000000000f');
update public.profiles set role = 'contributor' where id = 'a7000000-0000-4000-8000-00000000000c';

insert into public.articles (id, site_id, section_id, slug, title, status) values
  ('a7000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101',
   'ai-draft', 'A saved draft', 'draft');

insert into public.ai_suggestions (id, site_id, article_id, kind, prompt_version, model, input_hash, output_json, requested_by) values
  ('a7000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-0000000000a1',
   'headlines', 'headlines-1', 'test-model', 'abc123', '{"headlines": ["One"]}', 'a7000000-0000-4000-8000-00000000000e');

-- As anon: no access ---------------------------------------------------------------

set local request.jwt.claims = '{"role": "anon"}';
set local role anon;
do $$
declare
  failed boolean := false;
begin
  begin
    perform 1 from public.ai_suggestions;
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'anon select on ai_suggestions raises insufficient_privilege';
end;
$$;
reset role;
\echo 'ok  anon select refused'

-- As an editor: read, insert as self, accept once ------------------------------------

set local request.jwt.claims = '{"role": "authenticated", "sub": "a7000000-0000-4000-8000-00000000000e"}';
set local role authenticated;
do $$
declare
  failed boolean;
begin
  assert (select count(*) from public.ai_suggestions) = 1, 'editor reads suggestions';

  insert into public.ai_suggestions (site_id, article_id, kind, prompt_version, model, input_hash, output_json, requested_by)
  values ('00000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-0000000000a1', 'dek', 'dek-1', 'test-model', 'def456', '{"dek": "x"}',
          'a7000000-0000-4000-8000-00000000000e');

  failed := false;
  begin
    insert into public.ai_suggestions (site_id, article_id, kind, prompt_version, model, input_hash, output_json, requested_by)
    values ('00000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-0000000000a1', 'dek', 'dek-1', 'test-model', 'x', '{}',
            'a7000000-0000-4000-8000-00000000000f');
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'editor cannot insert a row requested by someone else';

  failed := false;
  begin
    update public.ai_suggestions set output_json = '{}' where id = 'a7000000-0000-4000-8000-0000000000b1';
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'editor cannot change output_json';

  failed := false;
  begin
    update public.ai_suggestions
       set accepted_by = 'a7000000-0000-4000-8000-00000000000f', accepted_at = now()
     where id = 'a7000000-0000-4000-8000-0000000000b1';
  exception when insufficient_privilege or check_violation then failed := true;
  end;
  assert failed, 'editor cannot record someone else as the accepter';

  update public.ai_suggestions
     set accepted_by = 'a7000000-0000-4000-8000-00000000000e', accepted_at = now()
   where id = 'a7000000-0000-4000-8000-0000000000b1';
  assert (select accepted_by from public.ai_suggestions where id = 'a7000000-0000-4000-8000-0000000000b1')
         = 'a7000000-0000-4000-8000-00000000000e', 'accept recorded';

  update public.ai_suggestions
     set accepted_by = 'a7000000-0000-4000-8000-00000000000e', accepted_at = now()
   where id = 'a7000000-0000-4000-8000-0000000000b1';
  -- Second accept matches no row (using accepted_by is null); it is not an error.

  failed := false;
  begin
    delete from public.ai_suggestions where id = 'a7000000-0000-4000-8000-0000000000b1';
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'no delete for editors';
end;
$$;
reset role;
\echo 'ok  editor'

-- As a contributor: nothing ----------------------------------------------------------

set local request.jwt.claims = '{"role": "authenticated", "sub": "a7000000-0000-4000-8000-00000000000c"}';
set local role authenticated;
do $$
declare
  failed boolean := false;
begin
  assert (select count(*) from public.ai_suggestions) = 0, 'contributor sees no suggestions';
  begin
    insert into public.ai_suggestions (site_id, article_id, kind, prompt_version, model, input_hash, output_json, requested_by)
    values ('00000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-0000000000a1', 'dek', 'dek-1', 'test-model', 'x', '{}',
            'a7000000-0000-4000-8000-00000000000c');
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'contributor cannot insert';
end;
$$;
reset role;
\echo 'ok  contributor'

rollback;
\echo 'ALL 0007 AI TESTS PASSED'
