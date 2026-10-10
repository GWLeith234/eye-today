-- 0018_polls_contests.sql — reader polls embedded in stories, and simple contests with an auditable draw.
--
-- Editors manage polls and contests under RLS. Anon has no table privileges.
-- Polls: anyone can read a poll that is not a draft through poll_public, which returns counts only when the
-- poll shows results to everyone or has closed. Votes go through cast_poll_vote, which only the service role can
-- call: the server passes either the signed-in profile or a salted hash of a random httpOnly device cookie, so a
-- client cannot invent voters. One vote per poll per voter is enforced by unique indexes.
-- Contests: enter_contest (anon and authenticated) needs consent and an open contest, one entry per email.
-- Draws are recorded with their seed so anyone can re-run them.

-- ---------------------------------------------------------------------------
-- Polls
-- ---------------------------------------------------------------------------

create table public.polls (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  question text not null check (char_length(btrim(question)) between 1 and 200 and question !~ '[<>]'),
  status text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  results text not null default 'after_vote' check (results in ('after_vote', 'after_close', 'always')),
  opens_at timestamptz,
  closes_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (opens_at is null or closes_at is null or closes_at > opens_at)
);
create index polls_site_id_idx on public.polls (site_id);
create index polls_created_by_idx on public.polls (created_by);

create table public.poll_options (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  poll_id uuid not null references public.polls (id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 120 and label !~ '[<>]'),
  sort integer not null default 0 check (sort between 0 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (poll_id, sort)
);
create index poll_options_poll_idx on public.poll_options (poll_id);
create index poll_options_site_id_idx on public.poll_options (site_id);

create table public.poll_votes (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  poll_id uuid not null references public.polls (id) on delete cascade,
  option_id uuid not null references public.poll_options (id) on delete cascade,
  profile_id uuid references public.profiles (id) on delete set null,
  device_hash text check (device_hash is null or device_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (profile_id is not null or device_hash is not null)
);
create unique index poll_votes_one_per_profile on public.poll_votes (poll_id, profile_id) where profile_id is not null;
create unique index poll_votes_one_per_device on public.poll_votes (poll_id, device_hash) where device_hash is not null;
create index poll_votes_option_idx on public.poll_votes (option_id);
create index poll_votes_site_id_idx on public.poll_votes (site_id);
create index poll_votes_profile_idx on public.poll_votes (profile_id);

create trigger set_updated_at before update on public.polls for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.poll_options for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.poll_votes for each row execute function public.set_updated_at();

-- A poll accepts votes when it is open and inside its window.
create function public._poll_is_open(p public.polls)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p.status = 'open'
     and (p.opens_at is null or p.opens_at <= pg_catalog.now())
     and (p.closes_at is null or p.closes_at > pg_catalog.now());
$$;

revoke all on function public._poll_is_open(public.polls) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Contests
-- ---------------------------------------------------------------------------

create table public.contests (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null check (char_length(btrim(title)) between 1 and 160 and title !~ '[<>]'),
  description text not null default '' check (char_length(description) <= 4000 and description !~ '[<>]'),
  prize text not null check (char_length(btrim(prize)) between 1 and 300 and prize !~ '[<>]'),
  rules text not null check (char_length(btrim(rules)) between 20 and 12000 and rules !~ '[<>]'),
  eligibility text not null default '' check (char_length(eligibility) <= 1000 and eligibility !~ '[<>]'),
  question text check (question is null or (char_length(question) <= 300 and question !~ '[<>]')),
  status text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  opens_at timestamptz,
  closes_at timestamptz not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, slug),
  check (opens_at is null or closes_at > opens_at)
);
create index contests_site_id_idx on public.contests (site_id);
create index contests_created_by_idx on public.contests (created_by);

create table public.contest_entries (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  contest_id uuid not null references public.contests (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120 and name !~ '[<>]'),
  email text not null check (char_length(email) <= 254 and email ~ '^[^@[:space:]<>]+@[^@[:space:]<>]+\.[^@[:space:]<>]+$'),
  answer text check (answer is null or (char_length(answer) <= 1000 and answer !~ '[<>]')),
  consent_at timestamptz not null,
  profile_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contest_id, email)
);
create index contest_entries_contest_idx on public.contest_entries (contest_id, created_at);
create index contest_entries_site_id_idx on public.contest_entries (site_id);
create index contest_entries_profile_idx on public.contest_entries (profile_id);

create table public.contest_draws (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  contest_id uuid not null references public.contests (id) on delete cascade,
  seed text not null check (seed ~ '^[0-9a-f]{64}$'),
  entry_count integer not null check (entry_count > 0),
  winner_entry_id uuid not null references public.contest_entries (id) on delete restrict,
  drawn_by uuid references public.profiles (id) on delete set null,
  drawn_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index contest_draws_contest_idx on public.contest_draws (contest_id, drawn_at);
create index contest_draws_site_id_idx on public.contest_draws (site_id);
create index contest_draws_winner_idx on public.contest_draws (winner_entry_id);
create index contest_draws_drawn_by_idx on public.contest_draws (drawn_by);

create trigger set_updated_at before update on public.contests for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.contest_entries for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.contest_draws for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: editors only on the tables; everyone else through the functions below.
-- ---------------------------------------------------------------------------

alter table public.polls enable row level security;
alter table public.polls force row level security;
alter table public.poll_options enable row level security;
alter table public.poll_options force row level security;
alter table public.poll_votes enable row level security;
alter table public.poll_votes force row level security;
alter table public.contests enable row level security;
alter table public.contests force row level security;
alter table public.contest_entries enable row level security;
alter table public.contest_entries force row level security;
alter table public.contest_draws enable row level security;
alter table public.contest_draws force row level security;

revoke all on table public.polls, public.poll_options, public.poll_votes,
  public.contests, public.contest_entries, public.contest_draws from anon, authenticated;

grant select, insert, update, delete on table public.polls, public.poll_options, public.contests to authenticated;
grant select on table public.poll_votes, public.contest_entries to authenticated;
grant select, insert on table public.contest_draws to authenticated;

create policy "editors manage polls" on public.polls for all to authenticated
  using ((select public.current_app_role()) in ('editor', 'admin'))
  with check ((select public.current_app_role()) in ('editor', 'admin'));
create policy "editors manage poll options" on public.poll_options for all to authenticated
  using ((select public.current_app_role()) in ('editor', 'admin'))
  with check ((select public.current_app_role()) in ('editor', 'admin'));
create policy "editors read poll votes" on public.poll_votes for select to authenticated
  using ((select public.current_app_role()) in ('editor', 'admin'));
create policy "editors manage contests" on public.contests for all to authenticated
  using ((select public.current_app_role()) in ('editor', 'admin'))
  with check ((select public.current_app_role()) in ('editor', 'admin'));
create policy "editors read contest entries" on public.contest_entries for select to authenticated
  using ((select public.current_app_role()) in ('editor', 'admin'));
create policy "editors read draws" on public.contest_draws for select to authenticated
  using ((select public.current_app_role()) in ('editor', 'admin'));
create policy "editors record draws" on public.contest_draws for insert to authenticated
  with check (
    (select public.current_app_role()) in ('editor', 'admin')
    and drawn_by = (select auth.uid())
    and exists (
      select 1 from public.contest_entries e
       where e.id = contest_draws.winner_entry_id and e.contest_id = contest_draws.contest_id
    )
  );

-- ---------------------------------------------------------------------------
-- Poll reads and votes
-- ---------------------------------------------------------------------------

-- Public view of one poll. Counts only when everyone may see them (results = 'always', or the poll is closed).
create function public.poll_public(p_id uuid)
returns table (
  id uuid, question text, state text, results text, closes_at timestamptz,
  option_id uuid, label text, sort integer, votes integer, total integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with poll as (
    select p.*,
           case
             when p.status = 'closed' or (p.closes_at is not null and p.closes_at <= pg_catalog.now()) then 'closed'
             when p.opens_at is not null and p.opens_at > pg_catalog.now() then 'upcoming'
             else 'open'
           end as state
      from public.polls p
      join public.sites s on s.id = p.site_id and s.slug = 'eyetoday'
     where p.id = p_id and p.status <> 'draft'
  ),
  counts as (
    select v.option_id, count(*)::integer as n from public.poll_votes v where v.poll_id = p_id group by v.option_id
  )
  select poll.id, poll.question, poll.state, poll.results, poll.closes_at, o.id, o.label, o.sort,
         case when poll.results = 'always' or poll.state = 'closed' then coalesce(c.n, 0) end,
         case when poll.results = 'always' or poll.state = 'closed'
              then (select coalesce(sum(n), 0)::integer from counts) end
    from poll
    join public.poll_options o on o.poll_id = poll.id
    left join counts c on c.option_id = o.id
   order by o.sort;
$$;

revoke all on function public.poll_public(uuid) from public, anon, authenticated;
grant execute on function public.poll_public(uuid) to anon, authenticated;

-- Server only: has this voter voted, which option, and the counts (shown to anyone who has voted).
create function public.poll_results_for(p_id uuid, p_profile uuid, p_device text)
returns table (option_id uuid, votes integer, total integer, my_option uuid)
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select v.option_id from public.poll_votes v
     where v.poll_id = p_id
       and ((p_profile is not null and v.profile_id = p_profile) or (p_device is not null and v.device_hash = p_device))
     limit 1
  ),
  counts as (
    select v.option_id, count(*)::integer as n from public.poll_votes v where v.poll_id = p_id group by v.option_id
  )
  select o.id, coalesce(c.n, 0), (select coalesce(sum(n), 0)::integer from counts), (select option_id from mine)
    from public.poll_options o
    left join counts c on c.option_id = o.id
   where o.poll_id = p_id and exists (select 1 from mine)
   order by o.sort;
$$;

revoke all on function public.poll_results_for(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.poll_results_for(uuid, uuid, text) to service_role;

-- Server only. Returns 'ok', 'already_voted', 'closed' or 'invalid'.
create function public.cast_poll_vote(p_poll uuid, p_option uuid, p_profile uuid, p_device text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  poll public.polls;
begin
  if (p_profile is null and p_device is null) or (p_device is not null and p_device !~ '^[0-9a-f]{64}$') then
    return 'invalid';
  end if;
  select * into poll from public.polls p where p.id = p_poll;
  if poll.id is null or poll.status = 'draft' then
    return 'invalid';
  end if;
  if not exists (select 1 from public.poll_options o where o.id = p_option and o.poll_id = p_poll) then
    return 'invalid';
  end if;
  if not public._poll_is_open(poll) then
    return 'closed';
  end if;
  -- A signed-in voter is one voter on every device; a device that already voted signed-out stays counted once.
  if exists (
    select 1 from public.poll_votes v
     where v.poll_id = p_poll
       and ((p_profile is not null and v.profile_id = p_profile) or (p_device is not null and v.device_hash = p_device))
  ) then
    return 'already_voted';
  end if;
  begin
    insert into public.poll_votes (site_id, poll_id, option_id, profile_id, device_hash)
    values (poll.site_id, p_poll, p_option, p_profile, p_device);
  exception when unique_violation then
    return 'already_voted';
  end;
  return 'ok';
end;
$$;

revoke all on function public.cast_poll_vote(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.cast_poll_vote(uuid, uuid, uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- Contest reads and entries
-- ---------------------------------------------------------------------------

create function public._contest_state(c public.contests)
returns text
language sql
stable
set search_path = ''
as $$
  select case
           when c.status = 'closed' or c.closes_at <= pg_catalog.now() then 'closed'
           when c.opens_at is not null and c.opens_at > pg_catalog.now() then 'upcoming'
           else 'open'
         end;
$$;

revoke all on function public._contest_state(public.contests) from public, anon, authenticated;

create function public.contests_public()
returns table (slug text, title text, prize text, state text, closes_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select c.slug, c.title, c.prize, public._contest_state(c), c.closes_at
    from public.contests c
    join public.sites s on s.id = c.site_id and s.slug = 'eyetoday'
   where c.status <> 'draft'
   order by (public._contest_state(c) = 'open') desc, c.closes_at desc
   limit 50;
$$;

-- The winner is shown by first name only once a draw exists.
create function public.contest_by_slug(p_slug text)
returns table (
  id uuid, slug text, title text, description text, prize text, rules text, eligibility text, question text,
  state text, opens_at timestamptz, closes_at timestamptz, winner_first_name text, drawn_at timestamptz, updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.slug, c.title, c.description, c.prize, c.rules, c.eligibility, c.question,
         public._contest_state(c), c.opens_at, c.closes_at,
         (select pg_catalog.split_part(pg_catalog.btrim(e.name), ' ', 1)
            from public.contest_draws d join public.contest_entries e on e.id = d.winner_entry_id
           where d.contest_id = c.id order by d.drawn_at desc limit 1),
         (select max(d.drawn_at) from public.contest_draws d where d.contest_id = c.id),
         c.updated_at
    from public.contests c
    join public.sites s on s.id = c.site_id and s.slug = 'eyetoday'
   where c.slug = pg_catalog.btrim(coalesce(p_slug, '')) and c.status <> 'draft'
   limit 1;
$$;

revoke all on function public.contests_public() from public, anon, authenticated;
revoke all on function public.contest_by_slug(text) from public, anon, authenticated;
grant execute on function public.contests_public() to anon, authenticated;
grant execute on function public.contest_by_slug(text) to anon, authenticated;

-- Returns 'ok', 'duplicate', 'closed' or raises on invalid input / too many entries.
create function public.enter_contest(p_contest uuid, p_name text, p_email text, p_answer text, p_consent boolean)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c public.contests;
  clean_email text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_email, '')));
  clean_name text := pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(p_name, '')), '[<>]', '', 'g');
  recent integer;
begin
  if p_consent is not true
     or pg_catalog.char_length(clean_name) not between 1 and 120
     or clean_email !~ '^[^@[:space:]<>]+@[^@[:space:]<>]+\.[^@[:space:]<>]+$'
     or pg_catalog.char_length(clean_email) > 254
     or pg_catalog.char_length(coalesce(p_answer, '')) > 1000 then
    raise exception 'invalid entry' using errcode = '23514';
  end if;
  select x.* into c from public.contests x
    join public.sites s on s.id = x.site_id and s.slug = 'eyetoday'
   where x.id = p_contest and x.status <> 'draft';
  if c.id is null then
    raise exception 'invalid entry' using errcode = '23514';
  end if;
  if public._contest_state(c) <> 'open' then
    return 'closed';
  end if;
  select count(*) into recent from public.contest_entries e
   where e.contest_id = c.id and e.created_at > pg_catalog.now() - interval '24 hours';
  if recent >= 2000 then
    raise exception 'too many entries' using errcode = 'P0001';
  end if;
  begin
    insert into public.contest_entries (site_id, contest_id, name, email, answer, consent_at, profile_id)
    values (
      c.site_id, c.id, clean_name, clean_email,
      nullif(pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(p_answer, '')), '[<>]', '', 'g'), ''),
      pg_catalog.now(), (select auth.uid())
    );
  exception when unique_violation then
    return 'duplicate';
  end;
  return 'ok';
end;
$$;

revoke all on function public.enter_contest(uuid, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.enter_contest(uuid, text, text, text, boolean) to anon, authenticated;

-- Editors draw after a contest closes. The seed comes from the server (crypto-random). The winner is entry
-- number sha256(seed) mod n, with entries ordered by id — the same rule as src/lib/contests/draw.ts, so anyone with
-- the seed and the entry list can repeat it. Done here so every entry counts, however many there are.
create function public.draw_contest(p_contest uuid, p_seed text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c public.contests;
  n integer;
  digest_hex text;
  acc numeric := 0;
  i integer;
  pick integer;
  winner uuid;
begin
  if (select public.current_app_role()) not in ('editor', 'admin') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_seed is null or p_seed !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid seed' using errcode = '23514';
  end if;
  select * into c from public.contests x where x.id = p_contest;
  if c.id is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if c.status <> 'closed' and c.closes_at > pg_catalog.now() then
    raise exception 'not closed' using errcode = '23514';
  end if;
  select count(*) into n from public.contest_entries e where e.contest_id = c.id;
  if n = 0 then
    raise exception 'no entries' using errcode = '23514';
  end if;

  digest_hex := pg_catalog.encode(extensions.digest(pg_catalog.decode(p_seed, 'hex'), 'sha256'), 'hex');
  for i in 1..64 loop
    acc := acc * 16 + pg_catalog.strpos('0123456789abcdef', pg_catalog.substr(digest_hex, i, 1)) - 1;
  end loop;
  pick := (acc % n)::integer;

  select e.id into winner from public.contest_entries e where e.contest_id = c.id order by e.id offset pick limit 1;
  insert into public.contest_draws (site_id, contest_id, seed, entry_count, winner_entry_id, drawn_by)
  values (c.site_id, c.id, p_seed, n, winner, (select auth.uid()));
  return winner;
end;
$$;

revoke all on function public.draw_contest(uuid, text) from public, anon, authenticated;
grant execute on function public.draw_contest(uuid, text) to authenticated;
