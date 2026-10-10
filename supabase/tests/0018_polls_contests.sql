-- supabase/tests/0018_polls_contests.sql — polls (reads, one vote per voter, results gating) and contests
-- (entries, consent, draws).
--
-- Run against a freshly reset local stack (plain psql, not `supabase test db`):
--   npx supabase db reset
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/0018_polls_contests.sql
--
-- One transaction, rolled back.

\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email) values
  ('d1800000-0000-4000-8000-0000000000e1', 'pc.editor@qa.test'),
  ('d1800000-0000-4000-8000-0000000000a1', 'pc.reader@qa.test');
update public.profiles set role = 'editor' where id = 'd1800000-0000-4000-8000-0000000000e1';

insert into public.polls (id, site_id, question, status, results, closes_at) values
  ('d1800000-0000-4000-8000-000000000a01', '00000000-0000-4000-8000-000000000001', 'Open poll?', 'open', 'after_vote', null),
  ('d1800000-0000-4000-8000-000000000a02', '00000000-0000-4000-8000-000000000001', 'Draft poll?', 'draft', 'always', null),
  ('d1800000-0000-4000-8000-000000000a03', '00000000-0000-4000-8000-000000000001', 'Ended poll?', 'open', 'after_close', now() - interval '1 minute'),
  ('d1800000-0000-4000-8000-000000000a04', '00000000-0000-4000-8000-000000000001', 'Public counts?', 'open', 'always', null);

insert into public.poll_options (id, site_id, poll_id, label, sort) values
  ('d1800000-0000-4000-8000-000000000b11', '00000000-0000-4000-8000-000000000001', 'd1800000-0000-4000-8000-000000000a01', 'Yes', 0),
  ('d1800000-0000-4000-8000-000000000b12', '00000000-0000-4000-8000-000000000001', 'd1800000-0000-4000-8000-000000000a01', 'No', 1),
  ('d1800000-0000-4000-8000-000000000b21', '00000000-0000-4000-8000-000000000001', 'd1800000-0000-4000-8000-000000000a02', 'A', 0),
  ('d1800000-0000-4000-8000-000000000b31', '00000000-0000-4000-8000-000000000001', 'd1800000-0000-4000-8000-000000000a03', 'A', 0),
  ('d1800000-0000-4000-8000-000000000b41', '00000000-0000-4000-8000-000000000001', 'd1800000-0000-4000-8000-000000000a04', 'A', 0),
  ('d1800000-0000-4000-8000-000000000b42', '00000000-0000-4000-8000-000000000001', 'd1800000-0000-4000-8000-000000000a04', 'B', 1);

insert into public.contests (id, site_id, slug, title, prize, rules, status, closes_at) values
  ('d1800000-0000-4000-8000-000000000c01', '00000000-0000-4000-8000-000000000001', 'pc-open', 'Open contest', 'A book',
   'One entry per person. Winner drawn at random after the closing date.', 'open', now() + interval '7 days'),
  ('d1800000-0000-4000-8000-000000000c02', '00000000-0000-4000-8000-000000000001', 'pc-closed', 'Closed contest', 'A mug',
   'One entry per person. Winner drawn at random after the closing date.', 'open', now() - interval '1 day'),
  ('d1800000-0000-4000-8000-000000000c03', '00000000-0000-4000-8000-000000000001', 'pc-draft', 'Draft contest', 'A hat',
   'One entry per person. Winner drawn at random after the closing date.', 'draft', now() + interval '7 days');

-- Anon ------------------------------------------------------------------------------------

set local request.jwt.claims = '{"role": "anon"}';
set local role anon;
do $$
declare
  failed boolean := false;
begin
  begin
    perform 1 from public.poll_votes;
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'anon cannot read votes';
  failed := false;
  begin
    perform 1 from public.contest_entries;
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'anon cannot read entries';
  failed := false;
  begin
    perform public.cast_poll_vote('d1800000-0000-4000-8000-000000000a01', 'd1800000-0000-4000-8000-000000000b11', null, repeat('a', 64));
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'anon cannot call the vote function directly';
  failed := false;
  begin
    perform public.poll_results_for('d1800000-0000-4000-8000-000000000a01', null, repeat('a', 64));
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'anon cannot read per-voter results';

  assert (select count(*) from public.poll_public('d1800000-0000-4000-8000-000000000a01')) = 2, 'open poll has two options';
  assert (select bool_and(votes is null) from public.poll_public('d1800000-0000-4000-8000-000000000a01')), 'after_vote poll hides counts';
  assert (select count(*) from public.poll_public('d1800000-0000-4000-8000-000000000a02')) = 0, 'draft poll is hidden';
  assert (select max(state) from public.poll_public('d1800000-0000-4000-8000-000000000a03')) = 'closed', 'past closing reads as closed';
  assert (select bool_and(votes = 0) from public.poll_public('d1800000-0000-4000-8000-000000000a03')), 'closed poll shows counts';
  assert (select bool_and(votes is not null) from public.poll_public('d1800000-0000-4000-8000-000000000a04')), 'always poll shows counts';

  assert (select count(*) from public.contests_public()) = 2, 'draft contest is not listed';
  assert (select state from public.contest_by_slug('pc-closed')) = 'closed', 'closed contest';
  assert (select count(*) from public.contest_by_slug('pc-draft')) = 0, 'draft contest is hidden';

  assert public.enter_contest('d1800000-0000-4000-8000-000000000c01', 'Ada <Lovelace>', ' Ada@Example.com ', 'Forty-two', true) = 'ok', 'anon can enter';
  assert public.enter_contest('d1800000-0000-4000-8000-000000000c01', 'Ada again', 'ada@example.com', null, true) = 'duplicate', 'one entry per email';
  assert public.enter_contest('d1800000-0000-4000-8000-000000000c02', 'Bob', 'bob@example.com', null, true) = 'closed', 'closed contest refuses';
  failed := false;
  begin
    perform public.enter_contest('d1800000-0000-4000-8000-000000000c01', 'Cy', 'cy@example.com', null, false);
  exception when check_violation then failed := true;
  end;
  assert failed, 'consent is required';
  failed := false;
  begin
    perform public.enter_contest('d1800000-0000-4000-8000-000000000c03', 'Cy', 'cy@example.com', null, true);
  exception when check_violation then failed := true;
  end;
  assert failed, 'a draft contest cannot be entered';
end;
$$;
reset role;

do $$
begin
  assert (select name from public.contest_entries where email = 'ada@example.com') = 'Ada Lovelace', 'angle brackets removed, email lowercased';
  assert (select consent_at is not null from public.contest_entries where email = 'ada@example.com'), 'consent time recorded';
end;
$$;
\echo 'ok  anon'

-- Votes (service role, as the server calls them) ------------------------------------------

set local role service_role;
do $$
declare
  dev_a text := repeat('a', 64);
  dev_b text := repeat('b', 64);
begin
  assert public.cast_poll_vote('d1800000-0000-4000-8000-000000000a01', 'd1800000-0000-4000-8000-000000000b11', null, dev_a) = 'ok', 'first vote counts';
  assert public.cast_poll_vote('d1800000-0000-4000-8000-000000000a01', 'd1800000-0000-4000-8000-000000000b12', null, dev_a) = 'already_voted', 'same device again is refused';
  assert public.cast_poll_vote('d1800000-0000-4000-8000-000000000a01', 'd1800000-0000-4000-8000-000000000b12', null, dev_b) = 'ok', 'another device counts';
  assert public.cast_poll_vote('d1800000-0000-4000-8000-000000000a01', 'd1800000-0000-4000-8000-000000000b11', 'd1800000-0000-4000-8000-0000000000a1', null) = 'ok', 'a signed-in reader counts';
  assert public.cast_poll_vote('d1800000-0000-4000-8000-000000000a01', 'd1800000-0000-4000-8000-000000000b11', 'd1800000-0000-4000-8000-0000000000a1', null) = 'already_voted', 'same account again is refused';
  assert public.cast_poll_vote('d1800000-0000-4000-8000-000000000a01', 'd1800000-0000-4000-8000-000000000b41', null, repeat('c', 64)) = 'invalid', 'option must belong to the poll';
  assert public.cast_poll_vote('d1800000-0000-4000-8000-000000000a02', 'd1800000-0000-4000-8000-000000000b21', null, repeat('c', 64)) = 'invalid', 'draft poll takes no votes';
  assert public.cast_poll_vote('d1800000-0000-4000-8000-000000000a03', 'd1800000-0000-4000-8000-000000000b31', null, repeat('c', 64)) = 'closed', 'closed poll takes no votes';
  assert public.cast_poll_vote('d1800000-0000-4000-8000-000000000a01', 'd1800000-0000-4000-8000-000000000b11', null, 'not-a-hash') = 'invalid', 'device hash must be a sha256 hex';

  assert (select my_option from public.poll_results_for('d1800000-0000-4000-8000-000000000a01', null, dev_a) limit 1) = 'd1800000-0000-4000-8000-000000000b11', 'a voter sees their choice';
  assert (select max(total) from public.poll_results_for('d1800000-0000-4000-8000-000000000a01', null, dev_a)) = 3, 'a voter sees the total';
  assert (select votes from public.poll_results_for('d1800000-0000-4000-8000-000000000a01', null, dev_a) where option_id = 'd1800000-0000-4000-8000-000000000b11') = 2, 'per-option count';
  assert (select count(*) from public.poll_results_for('d1800000-0000-4000-8000-000000000a01', null, repeat('d', 64))) = 0, 'a non-voter gets nothing';
end;
$$;
reset role;
\echo 'ok  votes'

-- Readers and editors ---------------------------------------------------------------------

set local request.jwt.claims = '{"role": "authenticated", "sub": "d1800000-0000-4000-8000-0000000000a1"}';
set local role authenticated;
do $$
declare
  failed boolean := false;
begin
  assert (select count(*) from public.polls) = 0, 'readers cannot read the polls table';
  assert (select count(*) from public.contest_entries) = 0, 'readers cannot read entries';
  begin
    insert into public.contest_draws (site_id, contest_id, seed, entry_count, winner_entry_id, drawn_by)
    values ('00000000-0000-4000-8000-000000000001', 'd1800000-0000-4000-8000-000000000c01', repeat('e', 64), 1,
            (select id from public.contest_entries limit 1), 'd1800000-0000-4000-8000-0000000000a1');
  exception when insufficient_privilege or not_null_violation then failed := true;
  end;
  assert failed, 'a reader cannot record a draw';
end;
$$;
reset role;

set local request.jwt.claims = '{"role": "authenticated", "sub": "d1800000-0000-4000-8000-0000000000e1"}';
set local role authenticated;
do $$
declare
  entry uuid := (select id from public.contest_entries where email = 'ada@example.com');
  failed boolean := false;
begin
  assert (select count(*) from public.polls) = 4, 'editors read polls';
  assert (select count(*) from public.poll_votes) = 3, 'editors read votes';
  insert into public.contest_draws (site_id, contest_id, seed, entry_count, winner_entry_id, drawn_by)
  values ('00000000-0000-4000-8000-000000000001', 'd1800000-0000-4000-8000-000000000c01', repeat('f', 64), 1, entry,
          'd1800000-0000-4000-8000-0000000000e1');
  assert (select winner_first_name from public.contest_by_slug('pc-open')) = 'Ada', 'the public page names the winner by first name';
  begin
    insert into public.contest_draws (site_id, contest_id, seed, entry_count, winner_entry_id, drawn_by)
    values ('00000000-0000-4000-8000-000000000001', 'd1800000-0000-4000-8000-000000000c02', repeat('f', 64), 1, entry,
            'd1800000-0000-4000-8000-0000000000e1');
  exception when insufficient_privilege then failed := true;
  end;
  assert failed, 'the winner must be an entry in that contest';
end;
$$;
reset role;
\echo 'ok  editors'

rollback;
