-- supabase/tests/0015_comments.sql — comments: posting, rate limit, bans, screening, reading, reports, editor tools.
--
-- Run against a freshly reset local stack (plain psql, not `supabase test db`):
--   npx supabase db reset
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/0015_comments.sql
--
-- One transaction, rolled back.

\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('d1500000-0000-4000-8000-0000000000e1', 'cm.editor@qa.test', '{}'),
  ('d1500000-0000-4000-8000-0000000000a1', 'cm.reader@qa.test', '{"full_name": "Rae Reader"}'),
  ('d1500000-0000-4000-8000-0000000000b1', 'cm.banned@qa.test', '{}'),
  ('d1500000-0000-4000-8000-0000000000c1', 'cm.other@qa.test', '{"full_name": "Olu Other"}'),
  ('d1500000-0000-4000-8000-0000000000d1', 'cm.contrib@qa.test', '{}');
update public.profiles set role = 'editor' where id = 'd1500000-0000-4000-8000-0000000000e1';
update public.profiles set role = 'contributor' where id = 'd1500000-0000-4000-8000-0000000000d1';
update public.profiles set role = 'supporter' where id = 'd1500000-0000-4000-8000-0000000000c1';
update public.profiles set display_name = null where id = 'd1500000-0000-4000-8000-0000000000b1';

insert into public.articles (id, site_id, section_id, slug, title, status, published_at, comments_enabled, created_by) values
  ('d1500000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101', 'cm-open', 'Open story', 'published', now() - interval '1 hour', true, null),
  ('d1500000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101', 'cm-off', 'Story with comments off', 'published', now() - interval '1 hour', false, null),
  ('d1500000-0000-4000-8000-0000000000f3', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101', 'cm-draft', 'Draft story', 'draft', null, true, 'd1500000-0000-4000-8000-0000000000d1'),
  ('d1500000-0000-4000-8000-0000000000f4', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101', 'cm-open-2', 'Another open story', 'published', now() - interval '1 hour', true, null);

do $$
begin
  assert (select not comments_enabled from public.sites where slug = 'eyetoday'), 'the site switch starts off';
  assert (select count(*) from public.articles where comments_enabled and slug not like 'cm-%') = 0, 'no seeded article has comments on';
end;
$$;

-- Anon -----------------------------------------------------------------------------------

set local request.jwt.claims = '{"role": "anon"}';
set local role anon;
do $$
declare
  t text;
  failed boolean;
begin
  foreach t in array array['comments', 'comment_reports', 'comment_user_status'] loop
    failed := false;
    begin execute format('select 1 from public.%I', t); exception when insufficient_privilege then failed := true; end;
    assert failed, 'anon cannot read ' || t;
  end loop;
  failed := false;
  begin perform public.post_comment('d1500000-0000-4000-8000-0000000000f1', null, 'Hello'); exception when insufficient_privilege then failed := true; end;
  assert failed, 'anon cannot post';
  failed := false;
  begin perform public.report_comment(gen_random_uuid(), 'x'); exception when insufficient_privilege then failed := true; end;
  assert failed, 'anon cannot report';
  failed := false;
  begin perform public.apply_comment_screen(gen_random_uuid(), '[]', true); exception when insufficient_privilege then failed := true; end;
  assert failed, 'anon cannot apply a screening result';
  failed := false;
  begin perform public.admin_comment_queue('pending', 10); exception when insufficient_privilege then failed := true; end;
  assert failed, 'anon cannot read the queue';
  assert not public.comments_open('d1500000-0000-4000-8000-0000000000f1'), 'with the site switch off, even an enabled story is closed';
  assert not public.comments_open('d1500000-0000-4000-8000-0000000000f2'), 'an article with comments off is closed';
  assert not public.comments_open('d1500000-0000-4000-8000-0000000000f3'), 'a draft is closed';
end;
$$;
reset role;
\echo 'ok  anon'

-- The site switch --------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "d1500000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
set local role authenticated;
do $$
declare
  failed boolean := false;
begin
  begin perform public.post_comment('d1500000-0000-4000-8000-0000000000f1', null, 'Site is still off'); exception when others then failed := sqlerrm = 'comments closed'; end;
  assert failed, 'with the site switch off, nobody can post';
  failed := false;
  begin perform public.set_site_comments(true); exception when insufficient_privilege then failed := true; end;
  assert failed, 'a reader cannot flip the site switch';
end;
$$;
reset role;

set local request.jwt.claims = '{"sub": "d1500000-0000-4000-8000-0000000000e1", "role": "authenticated"}';
set local role authenticated;
do $$
begin
  assert not public.site_comments_enabled(), 'the editor sees it off';
  perform public.set_site_comments(true);
  assert public.site_comments_enabled(), 'the editor turned it on';
  assert public.comments_open('d1500000-0000-4000-8000-0000000000f1'), 'an enabled story on an enabled site is open';
end;
$$;
reset role;

-- A contributor cannot turn comments on for their own article.
insert into public.article_authors (article_id, profile_id, site_id, sort)
values ('d1500000-0000-4000-8000-0000000000f3', 'd1500000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-000000000001', 0);
update public.articles set status = 'draft', comments_enabled = false where id = 'd1500000-0000-4000-8000-0000000000f3';
set local request.jwt.claims = '{"sub": "d1500000-0000-4000-8000-0000000000d1", "role": "authenticated"}';
set local role authenticated;
update public.articles set comments_enabled = true where id = 'd1500000-0000-4000-8000-0000000000f3';
reset role;
do $$
begin
  assert (select not comments_enabled from public.articles where id = 'd1500000-0000-4000-8000-0000000000f3'), 'a contributor cannot switch comments on';
end;
$$;

-- Posting ---------------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "d1500000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
set local role authenticated;
do $$
declare
  failed boolean := false;
  top uuid;
begin
  -- No direct writes of any kind.
  failed := false;
  begin
    insert into public.comments (site_id, article_id, profile_id, body, status)
    values ('00000000-0000-4000-8000-000000000001', 'd1500000-0000-4000-8000-0000000000f1', 'd1500000-0000-4000-8000-0000000000a1', 'Sneaky', 'published');
  exception when insufficient_privilege then failed := true; end;
  assert failed, 'a direct insert as authenticated fails';

  top := public.post_comment('d1500000-0000-4000-8000-0000000000f1', null, E'First comment.\nWith a second line & an ampersand.');
  assert top is not null, 'post_comment returns the id';
  assert (select status from public.comments where id = top) = 'pending', 'a new comment is pending';
  assert (select body from public.comments where id = top) = E'First comment.\nWith a second line & an ampersand.', 'the body is stored unchanged';

  begin update public.comments set status = 'published' where id = top; exception when insufficient_privilege then null; end;
  assert (select status from public.comments where id = top) = 'pending', 'an author cannot publish their own comment';
  failed := false;
  failed := false;
  begin delete from public.comments where id = top; exception when insufficient_privilege then failed := true; end;
  assert failed, 'an author cannot delete';
  failed := false;
  begin perform ai_flags from public.comments; exception when insufficient_privilege then failed := true; end;
  assert failed, 'ai_flags is not readable by an author';
  assert (select count(*) from public.comments) = 1, 'an author reads their own row';

  -- Refusals.
  foreach failed in array array[false] loop null; end loop;
  failed := false;
  begin perform public.post_comment('d1500000-0000-4000-8000-0000000000f2', null, 'x'); exception when others then failed := sqlerrm = 'comments closed'; end;
  assert failed, 'article switch off';
  failed := false;
  begin perform public.post_comment('d1500000-0000-4000-8000-0000000000f3', null, 'x'); exception when others then failed := sqlerrm = 'comments closed'; end;
  assert failed, 'a draft article';
  failed := false;
  begin perform public.post_comment('d1500000-0000-4000-8000-0000000000f1', null, 'a <b>tag</b>'); exception when others then failed := sqlerrm = 'invalid comment'; end;
  assert failed, 'angle brackets are refused, not rewritten';
  failed := false;
  begin perform public.post_comment('d1500000-0000-4000-8000-0000000000f1', null, '   '); exception when others then failed := sqlerrm = 'invalid comment'; end;
  assert failed, 'blank is refused';
  failed := false;
  begin perform public.post_comment('d1500000-0000-4000-8000-0000000000f1', null, repeat('x', 1001)); exception when others then failed := sqlerrm = 'invalid comment'; end;
  assert failed, 'over 1000 characters is refused';
  assert public.post_comment('d1500000-0000-4000-8000-0000000000f1', null, repeat('x', 1000)) is not null, '1000 characters is fine';
  failed := false;
  begin perform public.post_comment('d1500000-0000-4000-8000-0000000000f1', top, 'Reply to a pending parent'); exception when others then failed := sqlerrm = 'invalid parent'; end;
  assert failed, 'a parent that is not published is refused';
  failed := false;
  begin perform public.post_comment('d1500000-0000-4000-8000-0000000000f1', gen_random_uuid(), 'Missing parent'); exception when others then failed := sqlerrm = 'invalid parent'; end;
  assert failed, 'a missing parent is refused';
end;
$$;
reset role;

-- Rate limit: five in ten minutes, enforced in the database.
set local request.jwt.claims = '{"sub": "d1500000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
set local role authenticated;
do $$
declare
  failed boolean := false;
begin
  perform public.post_comment('d1500000-0000-4000-8000-0000000000f1', null, 'Third');
  perform public.post_comment('d1500000-0000-4000-8000-0000000000f1', null, 'Fourth');
  perform public.post_comment('d1500000-0000-4000-8000-0000000000f1', null, 'Fifth');
  begin perform public.post_comment('d1500000-0000-4000-8000-0000000000f1', null, 'Sixth'); exception when others then failed := sqlerrm = 'too many comments'; end;
  assert failed, 'the sixth comment in ten minutes is refused';
end;
$$;
reset role;
\echo 'ok  posting'

-- Bans ------------------------------------------------------------------------------------

insert into public.comment_user_status (profile_id, site_id, banned_until)
values ('d1500000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000001', 'infinity');
set local request.jwt.claims = '{"sub": "d1500000-0000-4000-8000-0000000000b1", "role": "authenticated"}';
set local role authenticated;
do $$
declare
  failed boolean := false;
begin
  begin perform public.post_comment('d1500000-0000-4000-8000-0000000000f1', null, 'Banned'); exception when insufficient_privilege then failed := true; end;
  assert failed, 'post_comment as a banned user fails';
  failed := false;
  begin perform 1 from public.comment_user_status; assert (select count(*) from public.comment_user_status) = 0, 'a banned user sees no status rows'; end;
end;
$$;
reset role;

-- A ban that has ended no longer blocks.
update public.comment_user_status set banned_until = now() - interval '1 minute' where profile_id = 'd1500000-0000-4000-8000-0000000000b1';
set local request.jwt.claims = '{"sub": "d1500000-0000-4000-8000-0000000000b1", "role": "authenticated"}';
set local role authenticated;
do $$
begin
  assert public.post_comment('d1500000-0000-4000-8000-0000000000f4', null, 'My ban has ended') is not null, 'an expired ban does not block';
end;
$$;
reset role;
\echo 'ok  bans'

-- Screening result ----------------------------------------------------------------------------

do $$
declare
  me constant uuid := 'd1500000-0000-4000-8000-0000000000a1';
  c uuid;
begin
  -- Fewer than three other published comments: even clean and asked to publish, it stays pending.
  select id into c from public.comments where profile_id = me and body = 'Third';
  set local role service_role;
  assert public.apply_comment_screen(c, '[]', true) = 'pending', 'an untrusted reader stays pending';
  reset role;
end;
$$;

-- Three published comments by the reader make them trusted.
insert into public.comments (site_id, article_id, profile_id, body, status)
select '00000000-0000-4000-8000-000000000001', 'd1500000-0000-4000-8000-0000000000f1', 'd1500000-0000-4000-8000-0000000000a1', 'Trusted ' || n, 'published'
  from generate_series(1, 3) n;

do $$
declare
  me constant uuid := 'd1500000-0000-4000-8000-0000000000a1';
  c uuid;
  failed boolean;
begin
  select id into c from public.comments where profile_id = me and body = 'Third';
  set local role service_role;
  assert public.apply_comment_screen(c, '[{"kind":"dosing","reason":"Asks for a dose."}]', true) = 'pending', 'a flag keeps it pending';
  reset role;
  assert (select ai_flags -> 0 ->> 'reason' from public.comments where id = c) = 'Asks for a dose.', 'the flag reason is stored';
  set local role service_role;
  assert public.apply_comment_screen(c, '[]', true) = 'published', 'clean and trusted is published';
  assert public.apply_comment_screen(c, '[]', true) is null, 'only a pending comment can be screened';
  reset role;

  -- A shadow ban forces shadow, even when clean and trusted.
  select id into c from public.comments where profile_id = me and body = 'Fourth';
  insert into public.comment_user_status (profile_id, site_id, shadow_banned) values (me, '00000000-0000-4000-8000-000000000001', true)
    on conflict (profile_id) do update set shadow_banned = true;
  set local role service_role;
  assert public.apply_comment_screen(c, '[]', true) = 'shadow', 'a shadow ban forces shadow';
  reset role;

  -- An author cannot store a screening result themselves.
  set local request.jwt.claims = '{"sub": "d1500000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
  set local role authenticated;
  failed := false;
  begin perform public.apply_comment_screen(c, '[]', true); exception when insufficient_privilege then failed := true; end;
  assert failed, 'an author cannot call apply_comment_screen';
  reset role;
end;
$$;
update public.comment_user_status set shadow_banned = false where profile_id = 'd1500000-0000-4000-8000-0000000000a1';
\echo 'ok  screening'

-- Reading ---------------------------------------------------------------------------------

-- Reader a1 has published "Trusted 1..3" and "Third"; "First comment" and the 1000-character one are pending.
insert into public.comments (id, site_id, article_id, profile_id, parent_id, body, status)
select 'd1500000-0000-4000-8000-0000000000c9', '00000000-0000-4000-8000-000000000001', 'd1500000-0000-4000-8000-0000000000f1',
       'd1500000-0000-4000-8000-0000000000c1', null, 'Published by a supporter', 'published';

set local request.jwt.claims = '{"role": "anon"}';
set local role anon;
do $$
begin
  assert (select count(*) from public.comments_for_article('d1500000-0000-4000-8000-0000000000f1') where body like 'First comment%') = 0, 'a pending comment is absent';
  assert (select count(*) from public.comments_for_article('d1500000-0000-4000-8000-0000000000f1') where body = 'Trusted 1') = 1, 'a published comment is present';
  assert (select display_name from public.comments_for_article('d1500000-0000-4000-8000-0000000000f1') where body = 'Trusted 1') = 'Rae Reader', 'with the display name';
  assert (select is_supporter from public.comments_for_article('d1500000-0000-4000-8000-0000000000f1') where body = 'Published by a supporter'), 'the supporter badge comes from role supporter';
  assert (select not is_supporter from public.comments_for_article('d1500000-0000-4000-8000-0000000000f1') where body = 'Trusted 1'), 'a reader has no badge';
  assert (select count(*) from public.comments_for_article('d1500000-0000-4000-8000-0000000000f1') where body = 'Fourth') = 0, 'a shadow comment is absent for everyone else';
  assert (select count(*) from public.comments_for_article('d1500000-0000-4000-8000-0000000000f2')) = 0, 'a closed story returns nothing';
end;
$$;
reset role;

-- Replies: one level only, and a reply is hidden when its parent is.
set local request.jwt.claims = '{"sub": "d1500000-0000-4000-8000-0000000000c1", "role": "authenticated"}';
set local role authenticated;
do $$
declare
  reply uuid;
  failed boolean := false;
begin
  reply := public.post_comment('d1500000-0000-4000-8000-0000000000f1', 'd1500000-0000-4000-8000-0000000000c9', 'A reply');
  assert reply is not null, 'a reply to a published top-level comment is accepted';
  assert (select parent_id from public.comments where id = reply) = 'd1500000-0000-4000-8000-0000000000c9', 'the parent is kept';
end;
$$;
reset role;

update public.comments set status = 'published' where body = 'A reply';

set local request.jwt.claims = '{"sub": "d1500000-0000-4000-8000-0000000000c1", "role": "authenticated"}';
set local role authenticated;
do $$
declare
  failed boolean := false;
begin
  begin
    perform public.post_comment('d1500000-0000-4000-8000-0000000000f1', (select id from public.comments where body = 'A reply'), 'A reply to a reply');
  exception when others then failed := sqlerrm = 'invalid parent'; end;
  assert failed, 'a reply to a reply fails';
  failed := false;
  begin
    perform public.post_comment('d1500000-0000-4000-8000-0000000000f4', 'd1500000-0000-4000-8000-0000000000c9', 'A reply on another article');
  exception when others then failed := sqlerrm = 'invalid parent'; end;
  assert failed, 'a parent on another article fails';
end;
$$;
reset role;

set local request.jwt.claims = '{"role": "anon"}';
set local role anon;
do $$
begin
  assert (select count(*) from public.comments_for_article('d1500000-0000-4000-8000-0000000000f1') where body = 'A reply') = 1, 'a published reply shows';
end;
$$;
reset role;
update public.comments set status = 'removed' where id = 'd1500000-0000-4000-8000-0000000000c9';
set local request.jwt.claims = '{"role": "anon"}';
set local role anon;
do $$
begin
  assert (select count(*) from public.comments_for_article('d1500000-0000-4000-8000-0000000000f1') where body in ('A reply', 'Published by a supporter')) = 0, 'removing a parent hides its replies too';
end;
$$;
reset role;

-- The author's view: held rows, rejected rows with the reason, shadow rows as ordinary comments.
update public.comments set status = 'rejected', reject_reason = 'Asks for personal medical advice.' where body = repeat('x', 1000);
update public.comments set status = 'shadow' where body = 'Fourth';
set local request.jwt.claims = '{"sub": "d1500000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
set local role authenticated;
do $$
begin
  assert (select count(*) from public.comments_for_author('d1500000-0000-4000-8000-0000000000f1') where status = 'pending' and body like 'First comment%') = 1, 'the author sees their held comment';
  assert (select reject_reason from public.comments_for_author('d1500000-0000-4000-8000-0000000000f1') where body = repeat('x', 1000)) = 'Asks for personal medical advice.', 'and the reason for a rejection';
  assert (select status from public.comments_for_author('d1500000-0000-4000-8000-0000000000f1') where body = 'Fourth') = 'published', 'a shadow comment looks published to its author';
  assert (select count(*) from public.comments where status = 'shadow') = 0, 'the table never shows the author a shadow row';
  assert (select count(*) from public.comments_for_author('d1500000-0000-4000-8000-0000000000f1') where status = 'shadow') = 0, 'nothing is ever labelled shadow';
end;
$$;
reset role;
set local request.jwt.claims = '{"sub": "d1500000-0000-4000-8000-0000000000c1", "role": "authenticated"}';
set local role authenticated;
do $$
begin
  assert (select count(*) from public.comments_for_author('d1500000-0000-4000-8000-0000000000f1') where body like 'First comment%') = 0, 'another reader sees none of it';
end;
$$;
reset role;
\echo 'ok  reading'

-- Reports ----------------------------------------------------------------------------------

update public.comments set status = 'published' where body = 'Published by a supporter';
set local request.jwt.claims = '{"sub": "d1500000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
set local role authenticated;
do $$
declare
  failed boolean := false;
begin
  perform public.report_comment('d1500000-0000-4000-8000-0000000000c9', 'Gives a dose.');
  perform public.report_comment('d1500000-0000-4000-8000-0000000000c9', 'Reporting again does nothing.');
  assert (select count(*) from public.comment_reports) = 0, 'a reader cannot read reports';
  begin perform public.report_comment((select id from public.comments where body = 'Trusted 1'), 'My own comment'); exception when others then failed := sqlerrm = 'invalid report'; end;
  assert failed, 'a reader cannot report their own comment';
  failed := false;
  begin perform public.report_comment((select id from public.comments where body like 'First comment%'), 'Not published'); exception when others then failed := sqlerrm = 'invalid report'; end;
  assert failed, 'only a published comment can be reported';
end;
$$;
reset role;
do $$
begin
  assert (select count(*) from public.comment_reports where comment_id = 'd1500000-0000-4000-8000-0000000000c9') = 1, 'one report per reader per comment';
  assert (select status from public.comments where id = 'd1500000-0000-4000-8000-0000000000c9') = 'published', 'a report does not change the comment';
end;
$$;

-- Editor tools -------------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "d1500000-0000-4000-8000-0000000000e1", "role": "authenticated"}';
set local role authenticated;
do $$
declare
  row_ record;
  failed boolean := false;
begin
  assert (select count(*) from public.admin_comment_queue('pending', 50)) >= 1, 'the queue lists pending comments';
  select * into row_ from public.admin_comment_queue('reported', 50) where body = 'Published by a supporter';
  assert row_.report_count = 1 and row_.display_name = 'Olu Other', 'the reported queue carries the count and the name';
  assert (select ai_flags from public.admin_comment_queue('published', 50) limit 1) is not null, 'editors read ai_flags through the queue';
  begin perform ai_flags from public.comments; exception when insufficient_privilege then failed := true; end;
  assert failed, 'even an editor reads ai_flags only through the queue function';

  update public.comments set status = 'rejected', reject_reason = 'Off topic.' where body like 'First comment%' and status = 'pending';
  assert (select status from public.comments where body like 'First comment%') = 'rejected', 'an editor rejects with a reason';
  update public.comments set status = 'removed' where body = 'Trusted 3' and status = 'published';
  assert (select status from public.comments where body = 'Trusted 3') = 'removed', 'an editor removes a published comment';

  insert into public.comment_user_status (profile_id, site_id, banned_until)
  values ('d1500000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-000000000001', now() + interval '7 days');
  assert (select count(*) from public.admin_comment_users() where display_name = 'Olu Other') = 1, 'a ban shows in the banned list';
  update public.comment_user_status set banned_until = null where profile_id = 'd1500000-0000-4000-8000-0000000000c1';
  assert (select count(*) from public.admin_comment_users() where display_name = 'Olu Other') = 0, 'lifting it removes them';
end;
$$;
reset role;
\echo 'ok  editor tools'

rollback;
