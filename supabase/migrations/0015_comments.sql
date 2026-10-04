-- 0015_comments.sql — reader comments and moderation.
--
-- Comments are plain text, written by signed-in readers, and wait for an editor unless the screening step
-- (src/lib/comments) finds nothing wrong and the reader already has three published comments. Everything
-- a reader can do goes through the definer functions below; nobody has insert, update or delete on
-- comments. Both switches (the site's and the article's) default to off, and no seed turns them on.

-- ---------------------------------------------------------------------------
-- Switches
-- ---------------------------------------------------------------------------

alter table public.sites add column comments_enabled boolean not null default false;
alter table public.articles add column comments_enabled boolean not null default false;

-- Only an editor, an admin or the table owner (migrations, tests) can change an article's switch.
-- A contributor edits their own drafts through the table grants, so without this a draft could be
-- written with comments already on.
create function public.articles_lock_comments_flag()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
       select 1 from pg_catalog.pg_class c
        where c.oid = 'public.articles'::pg_catalog.regclass
          and pg_catalog.pg_has_role(current_user, c.relowner, 'MEMBER')
     )
     or (select public.current_app_role()) in ('editor', 'admin') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.comments_enabled := false;
  else
    new.comments_enabled := old.comments_enabled;
  end if;
  return new;
end;
$$;

revoke all on function public.articles_lock_comments_flag() from public, anon, authenticated;

create trigger articles_lock_comments_flag
  before insert or update of comments_enabled on public.articles
  for each row execute function public.articles_lock_comments_flag();

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  article_id uuid not null references public.articles (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  parent_id uuid references public.comments (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000 and body !~ '[<>]'),
  status text not null default 'pending' check (status in ('pending', 'published', 'rejected', 'removed', 'shadow')),
  ai_flags jsonb not null default '[]'::jsonb check (jsonb_typeof(ai_flags) = 'array'),
  reject_reason text check (reject_reason is null or char_length(reject_reason) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index comments_site_id_idx on public.comments (site_id);
create index comments_article_status_created_idx on public.comments (article_id, status, created_at);
create index comments_profile_status_idx on public.comments (profile_id, status);
create index comments_parent_id_idx on public.comments (parent_id);

create table public.comment_reports (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  comment_id uuid not null references public.comments (id) on delete cascade,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null check (char_length(btrim(reason)) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (comment_id, reporter_id)
);
create index comment_reports_site_id_idx on public.comment_reports (site_id);
create index comment_reports_reporter_id_idx on public.comment_reports (reporter_id);

-- There is deliberately no trust column. Whether someone is trusted is counted from their published comments.
create table public.comment_user_status (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  site_id uuid not null references public.sites (id) on delete cascade,
  shadow_banned boolean not null default false,
  -- A permanent ban is the timestamp 'infinity'.
  banned_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index comment_user_status_site_id_idx on public.comment_user_status (site_id);

do $$
declare
  t text;
begin
  foreach t in array array['comments', 'comment_reports', 'comment_user_status'] loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants and policies
-- ---------------------------------------------------------------------------

-- Authors read their own rows, never ai_flags. A shadow row is not part of that read: the author sees it
-- through comments_for_author, which presents it as an ordinary comment, so the table never says "shadow".
grant select (id, site_id, article_id, profile_id, parent_id, body, status, reject_reason, created_at, updated_at)
  on table public.comments to authenticated;
grant update (status, reject_reason) on table public.comments to authenticated;

create policy "authors read their own comments"
  on public.comments for select to authenticated
  using (profile_id = (select auth.uid()) and status <> 'shadow');

create policy "editors read comments"
  on public.comments for select to authenticated
  using ((select public.current_app_role()) in ('editor', 'admin'));

create policy "editors moderate comments"
  on public.comments for update to authenticated
  using ((select public.current_app_role()) in ('editor', 'admin'))
  with check ((select public.current_app_role()) in ('editor', 'admin'));

grant select on table public.comment_reports to authenticated;
create policy "editors read comment reports"
  on public.comment_reports for select to authenticated
  using ((select public.current_app_role()) in ('editor', 'admin'));

grant select, insert, update on table public.comment_user_status to authenticated;
create policy "editors read comment user status"
  on public.comment_user_status for select to authenticated
  using ((select public.current_app_role()) in ('editor', 'admin'));
create policy "editors add comment user status"
  on public.comment_user_status for insert to authenticated
  with check ((select public.current_app_role()) in ('editor', 'admin'));
create policy "editors change comment user status"
  on public.comment_user_status for update to authenticated
  using ((select public.current_app_role()) in ('editor', 'admin'))
  with check ((select public.current_app_role()) in ('editor', 'admin'));

-- ---------------------------------------------------------------------------
-- Posting. Status is not an argument: every comment starts pending.
-- ---------------------------------------------------------------------------

create function public.post_comment(p_article_id uuid, p_parent_id uuid, p_body text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  until_ timestamptz;
  art record;
  parent public.comments;
  recent integer;
  new_id uuid;
begin
  if me is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;

  -- One posting at a time per person, so two requests cannot both pass the rate check.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('post_comment:' || me::text, 0));

  select u.banned_until into until_ from public.comment_user_status u where u.profile_id = me;
  if until_ is not null and until_ > pg_catalog.now() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if p_body is null
     or pg_catalog.char_length(p_body) not between 1 and 1000
     or pg_catalog.btrim(p_body) = ''
     or p_body ~ '[<>]' then
    raise exception 'invalid comment' using errcode = '23514';
  end if;

  select a.id, a.site_id into art
    from public.articles a
    join public.sites s on s.id = a.site_id
   where a.id = p_article_id
     and a.status = 'published'
     and a.published_at is not null
     and a.published_at <= pg_catalog.now()
     and a.comments_enabled
     and s.comments_enabled;
  if not found then
    raise exception 'comments closed' using errcode = 'P0001';
  end if;

  if p_parent_id is not null then
    select * into parent from public.comments c where c.id = p_parent_id;
    if not found
       or parent.article_id <> p_article_id
       or parent.status <> 'published'
       or parent.parent_id is not null then
      raise exception 'invalid parent' using errcode = '23514';
    end if;
  end if;

  select count(*) into recent from public.comments c
   where c.profile_id = me and c.created_at > pg_catalog.now() - interval '10 minutes';
  if recent >= 5 then
    raise exception 'too many comments' using errcode = 'P0001';
  end if;

  insert into public.comments (site_id, article_id, profile_id, parent_id, body, status)
  values (art.site_id, p_article_id, me, p_parent_id, p_body, 'pending')
  returning id into new_id;
  return new_id;
end;
$$;

revoke all on function public.post_comment(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.post_comment(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Screening result. Service role only: it is how the server stores what the assistant found. Whatever it
-- is asked for, the database decides the final status itself, so a bug upstream cannot publish a flagged
-- comment, publish for someone without three published comments, or skip the shadow ban.
-- ---------------------------------------------------------------------------

create function public.apply_comment_screen(p_comment_id uuid, p_flags jsonb, p_publish boolean)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c public.comments;
  flags jsonb := coalesce(p_flags, '[]'::jsonb);
  shadow boolean;
  trusted boolean;
  final text;
begin
  if pg_catalog.jsonb_typeof(flags) <> 'array' or pg_catalog.jsonb_array_length(flags) > 10 then
    raise exception 'invalid flags' using errcode = '23514';
  end if;

  select * into c from public.comments x where x.id = p_comment_id and x.status = 'pending' for update;
  if not found then
    return null;
  end if;

  select coalesce(u.shadow_banned, false) into shadow from public.comment_user_status u where u.profile_id = c.profile_id;
  shadow := coalesce(shadow, false);
  trusted := (
    select count(*) from public.comments o
     where o.profile_id = c.profile_id and o.status = 'published' and o.id <> c.id
  ) >= 3;

  final := case
    when shadow then 'shadow'
    when p_publish and pg_catalog.jsonb_array_length(flags) = 0 and trusted then 'published'
    else 'pending'
  end;

  update public.comments set ai_flags = flags, status = final where id = c.id;
  return final;
end;
$$;

revoke all on function public.apply_comment_screen(uuid, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.apply_comment_screen(uuid, jsonb, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- Reading
-- ---------------------------------------------------------------------------

-- Whether the story shows a comment area at all. Both switches on, and the story live.
create function public.comments_open(p_article_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.articles a
      join public.sites s on s.id = a.site_id
     where a.id = p_article_id
       and a.status = 'published'
       and a.published_at is not null
       and a.published_at <= pg_catalog.now()
       and a.comments_enabled
       and s.comments_enabled
  );
$$;

-- Published comments only. A reply whose parent is not published is hidden with it.
create function public.comments_for_article(p_article_id uuid)
returns table (id uuid, parent_id uuid, body text, created_at timestamptz, display_name text, is_supporter boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.parent_id, c.body, c.created_at,
         coalesce(nullif(pg_catalog.btrim(p.display_name), ''), 'Reader'),
         p.role = 'supporter'
    from public.comments c
    join public.profiles p on p.id = c.profile_id
   where public.comments_open(c.article_id)
     and c.article_id = p_article_id
     and c.status = 'published'
     and (
       c.parent_id is null
       or exists (select 1 from public.comments pc where pc.id = c.parent_id and pc.status = 'published')
     )
   order by c.created_at, c.id
   limit 500;
$$;

-- The caller's own held, rejected and shadow comments. A shadow comment is returned as published, so the
-- author sees it as an ordinary comment and nothing here names the ban. ai_flags is never returned.
create function public.comments_for_author(p_article_id uuid)
returns table (id uuid, parent_id uuid, body text, created_at timestamptz, status text, reject_reason text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.parent_id, c.body, c.created_at,
         case c.status when 'shadow' then 'published' else c.status end,
         case c.status when 'rejected' then c.reject_reason else null end
    from public.comments c
   where c.article_id = p_article_id
     and c.profile_id = (select auth.uid())
     and c.status in ('pending', 'rejected', 'shadow')
   order by c.created_at, c.id
   limit 100;
$$;

-- ---------------------------------------------------------------------------
-- Reports. One per reader per comment. Reporting changes nothing about the comment.
-- ---------------------------------------------------------------------------

create function public.report_comment(p_comment_id uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  why text := pg_catalog.btrim(coalesce(p_reason, ''));
  c public.comments;
  recent integer;
begin
  if me is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  if pg_catalog.char_length(why) not between 1 and 500 then
    raise exception 'invalid report' using errcode = '23514';
  end if;
  select * into c from public.comments x where x.id = p_comment_id and x.status = 'published';
  if not found or c.profile_id = me then
    raise exception 'invalid report' using errcode = '23514';
  end if;
  select count(*) into recent from public.comment_reports r
   where r.reporter_id = me and r.created_at > pg_catalog.now() - interval '1 hour';
  if recent >= 20 then
    raise exception 'too many reports' using errcode = 'P0001';
  end if;
  insert into public.comment_reports (site_id, comment_id, reporter_id, reason)
  values (c.site_id, c.id, me, why)
  on conflict (comment_id, reporter_id) do nothing;
end;
$$;

revoke all on function public.report_comment(uuid, text) from public, anon, authenticated;
grant execute on function public.report_comment(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Editor tools
-- ---------------------------------------------------------------------------

-- The moderation queue, with the assistant's flags and the report count. ai_flags is not readable through
-- the table grant, so editors read it here. status: pending, published, reported (published with reports),
-- rejected or removed.
create function public.admin_comment_queue(p_status text, p_limit integer)
returns table (
  id uuid,
  article_id uuid,
  article_title text,
  article_slug text,
  section_slug text,
  profile_id uuid,
  display_name text,
  body text,
  status text,
  ai_flags jsonb,
  reject_reason text,
  created_at timestamptz,
  report_count integer,
  shadow_banned boolean,
  banned_until timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select public.current_app_role()) not in ('editor', 'admin') then
    raise exception 'editors only' using errcode = '42501';
  end if;
  if p_status not in ('pending', 'published', 'reported', 'rejected', 'removed') then
    raise exception 'invalid status' using errcode = '23514';
  end if;
  return query
    select c.id, c.article_id, a.title, a.slug, sec.slug, c.profile_id,
           coalesce(nullif(pg_catalog.btrim(p.display_name), ''), 'Reader'),
           c.body, c.status, c.ai_flags, c.reject_reason, c.created_at,
           (select count(*)::integer from public.comment_reports r where r.comment_id = c.id),
           coalesce(u.shadow_banned, false), u.banned_until
      from public.comments c
      join public.articles a on a.id = c.article_id
      join public.sections sec on sec.id = a.section_id
      join public.profiles p on p.id = c.profile_id
      left join public.comment_user_status u on u.profile_id = c.profile_id
     where case p_status
             when 'reported' then c.status = 'published' and exists (select 1 from public.comment_reports r where r.comment_id = c.id)
             else c.status = p_status
           end
     order by c.created_at desc, c.id
     limit greatest(1, least(coalesce(p_limit, 100), 200));
end;
$$;

-- People with a ban or a shadow ban in force.
create function public.admin_comment_users()
returns table (profile_id uuid, display_name text, shadow_banned boolean, banned_until timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select public.current_app_role()) not in ('editor', 'admin') then
    raise exception 'editors only' using errcode = '42501';
  end if;
  return query
    select u.profile_id, coalesce(nullif(pg_catalog.btrim(p.display_name), ''), 'Reader'), u.shadow_banned, u.banned_until
      from public.comment_user_status u
      join public.profiles p on p.id = u.profile_id
     where u.shadow_banned or (u.banned_until is not null and u.banned_until > pg_catalog.now())
     order by u.updated_at desc
     limit 200;
end;
$$;

-- The site-wide switch. Sites are not readable through the API, so the admin page reads and writes it here.
create function public.site_comments_enabled()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select public.current_app_role()) not in ('editor', 'admin') then
    raise exception 'editors only' using errcode = '42501';
  end if;
  return (select s.comments_enabled from public.sites s where s.slug = 'eyetoday');
end;
$$;

create function public.set_site_comments(p_enabled boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if (select public.current_app_role()) not in ('editor', 'admin') then
    raise exception 'editors only' using errcode = '42501';
  end if;
  update public.sites set comments_enabled = coalesce(p_enabled, false) where slug = 'eyetoday';
end;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.admin_comment_queue(text, integer)',
    'public.admin_comment_users()',
    'public.site_comments_enabled()',
    'public.set_site_comments(boolean)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;

  -- Reads. Both are safe for anyone: they return published comments of an open story, or nothing.
  revoke all on function public.comments_open(uuid) from public, anon, authenticated;
  grant execute on function public.comments_open(uuid) to anon, authenticated;
  revoke all on function public.comments_for_article(uuid) from public, anon, authenticated;
  grant execute on function public.comments_for_article(uuid) to anon, authenticated;
  revoke all on function public.comments_for_author(uuid) from public, anon, authenticated;
  grant execute on function public.comments_for_author(uuid) to authenticated;
end;
$$;
