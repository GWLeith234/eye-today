-- supabase/tests/0020_edition_items_replace.sql — replace_edition_items swaps the list atomically, keeps
-- order, and is editor-only.
--
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/0020_edition_items_replace.sql
--
-- One transaction, rolled back.

\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email) values
  ('d2000000-0000-4000-8000-0000000000e1', 'ri.editor@qa.test'),
  ('d2000000-0000-4000-8000-0000000000a1', 'ri.reader@qa.test');
update public.profiles set role = 'editor' where id = 'd2000000-0000-4000-8000-0000000000e1';

insert into public.articles (id, site_id, section_id, slug, title, body_html, status, published_at) values
  ('d2000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101', 'ri-a', 'A', '<p>a</p>', 'published', now() - interval '1 day'),
  ('d2000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101', 'ri-b', 'B', '<p>b</p>', 'published', now() - interval '1 day'),
  ('d2000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101', 'ri-c', 'C', '<p>c</p>', 'published', now() - interval '1 day');

insert into public.editions (id, site_id, slug, title, issue_month, status) values
  ('d2000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000001', 'ri-edition', 'Replace me', '2026-10-01', 'draft');
insert into public.edition_items (site_id, edition_id, article_id, sort) values
  ('00000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000301', 'd2000000-0000-4000-8000-000000000201', 0),
  ('00000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000301', 'd2000000-0000-4000-8000-000000000202', 1);

-- Editor ------------------------------------------------------------------------------------

set local request.jwt.claims = '{"role": "authenticated", "sub": "d2000000-0000-4000-8000-0000000000e1"}';
set local role authenticated;
do $$
declare
  n integer;
  failed boolean := false;
begin
  -- Reorder and swap: C, A (B dropped).
  n := public.replace_edition_items('d2000000-0000-4000-8000-000000000301',
         array['d2000000-0000-4000-8000-000000000203', 'd2000000-0000-4000-8000-000000000201']::uuid[]);
  assert n = 2, format('two rows written, got %s', n);
  assert (select array_agg(article_id order by sort) from public.edition_items where edition_id = 'd2000000-0000-4000-8000-000000000301')
         = array['d2000000-0000-4000-8000-000000000203', 'd2000000-0000-4000-8000-000000000201']::uuid[], 'order follows the array';

  -- A bad list (an article that does not exist) leaves the previous list untouched: one statement, one transaction.
  begin
    perform public.replace_edition_items('d2000000-0000-4000-8000-000000000301',
      array['d2000000-0000-4000-8000-000000000202', 'd2000000-0000-4000-8000-0000000000ff']::uuid[]);
  exception when foreign_key_violation then failed := true;
  end;
  assert failed, 'a missing article is refused';
  assert (select count(*) from public.edition_items where edition_id = 'd2000000-0000-4000-8000-000000000301') = 2, 'the old list survives a failed replace';
  assert (select article_id from public.edition_items where edition_id = 'd2000000-0000-4000-8000-000000000301' and sort = 0)
         = 'd2000000-0000-4000-8000-000000000203', 'and is unchanged';

  -- Empty list clears it.
  n := public.replace_edition_items('d2000000-0000-4000-8000-000000000301', '{}'::uuid[]);
  assert n = 0, 'empty list clears';
  assert (select count(*) from public.edition_items where edition_id = 'd2000000-0000-4000-8000-000000000301') = 0, 'no rows left';
end $$;
reset role;

-- Reader: RLS hides the edition, so there is nothing to replace --------------------------------

set local request.jwt.claims = '{"role": "authenticated", "sub": "d2000000-0000-4000-8000-0000000000a1"}';
set local role authenticated;
do $$
declare
  failed boolean := false;
begin
  begin
    perform public.replace_edition_items('d2000000-0000-4000-8000-000000000301', array['d2000000-0000-4000-8000-000000000201']::uuid[]);
  exception when no_data_found then failed := true;
  end;
  assert failed, 'a reader cannot touch edition items';
end $$;
reset role;

-- Anon cannot even call it -----------------------------------------------------------------------

set local request.jwt.claims = '{"role": "anon"}';
set local role anon;
do $$
declare
  failed boolean := false;
begin
  begin
    perform public.replace_edition_items('d2000000-0000-4000-8000-000000000301', '{}'::uuid[]);
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'anon has no execute';
end $$;
reset role;

rollback;
