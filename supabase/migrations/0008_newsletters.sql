-- 0008_newsletters.sql — double opt-in signup, issue builder, sends, delivery events.
--
-- newsletter_lists, newsletter_subscribers and newsletter_issues already exist (0001) and
-- have no client grants. Nothing here opens subscribers to anon: email addresses are only
-- reachable through the definer functions below, each of which takes a hashed token or an
-- already-hashed value, and returns no address.

-- ---------------------------------------------------------------------------
-- Columns on existing tables
-- ---------------------------------------------------------------------------

alter table public.newsletter_subscribers
  add column consented_at timestamptz,
  add column ip_hash text,
  add column confirm_token_hash text,
  add column unsubscribe_token_hash text;
create index newsletter_subscribers_confirm_hash_idx on public.newsletter_subscribers (confirm_token_hash)
  where confirm_token_hash is not null;
create index newsletter_subscribers_unsubscribe_hash_idx on public.newsletter_subscribers (unsubscribe_token_hash)
  where unsubscribe_token_hash is not null;
create index newsletter_subscribers_ip_hash_idx on public.newsletter_subscribers (ip_hash);

alter table public.newsletter_issues
  add column story_ids uuid[] not null default '{}',
  -- Plain text. Escaped by the email template, never rendered as HTML.
  add column intro text not null default '';

-- ---------------------------------------------------------------------------
-- The two lists every site gets
-- ---------------------------------------------------------------------------

insert into public.newsletter_lists (site_id, slug, name, description)
select s.id, v.slug, v.name, v.description
  from public.sites s
 cross join (values
   ('daily', 'Daily Brief', 'The day''s stories, once a day.'),
   ('weekly', 'Weekly Roundup', 'The week''s best reading, once a week.')
 ) as v (slug, name, description)
on conflict (site_id, slug) do nothing;

-- ---------------------------------------------------------------------------
-- New tables. Written by the send code and the Resend webhook; read by editors.
-- ---------------------------------------------------------------------------

create table public.newsletter_events (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  issue_id uuid not null references public.newsletter_issues (id) on delete cascade,
  subscriber_id uuid not null references public.newsletter_subscribers (id) on delete cascade,
  provider_id text not null,
  event_type text not null check (event_type in ('delivered', 'opened', 'clicked', 'bounced', 'complained')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_id, event_type)
);
create index newsletter_events_issue_id_idx on public.newsletter_events (issue_id, event_type);
create index newsletter_events_subscriber_id_idx on public.newsletter_events (subscriber_id);
create index newsletter_events_site_id_idx on public.newsletter_events (site_id);

create table public.newsletter_deliveries (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  issue_id uuid not null references public.newsletter_issues (id) on delete cascade,
  subscriber_id uuid not null references public.newsletter_subscribers (id) on delete cascade,
  provider_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (issue_id, subscriber_id)
);
create index newsletter_deliveries_provider_id_idx on public.newsletter_deliveries (provider_id);
create index newsletter_deliveries_subscriber_id_idx on public.newsletter_deliveries (subscriber_id);
create index newsletter_deliveries_site_id_idx on public.newsletter_deliveries (site_id);

-- One row per signup call, so the hourly limit counts every call (including repeats of the
-- same address), not only rows that changed. Only request_newsletter_subscribe touches it.
create table public.newsletter_signup_attempts (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  ip_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index newsletter_signup_attempts_ip_idx on public.newsletter_signup_attempts (ip_hash, created_at desc);
create index newsletter_signup_attempts_site_id_idx on public.newsletter_signup_attempts (site_id);

do $$
declare
  t text;
begin
  foreach t in array array['newsletter_events', 'newsletter_deliveries', 'newsletter_signup_attempts'] loop
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      t
    );
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Editor and admin access (no anon policies anywhere in this file)
-- ---------------------------------------------------------------------------

grant select on table public.newsletter_lists to authenticated;
create policy "editors read newsletter lists"
  on public.newsletter_lists for select to authenticated
  using ((select public.current_app_role()) in ('editor', 'admin'));

-- Editors read subscribers because "Send now" runs as the editor. Nobody else does.
grant select on table public.newsletter_subscribers to authenticated;
create policy "editors read newsletter subscribers"
  on public.newsletter_subscribers for select to authenticated
  using ((select public.current_app_role()) in ('editor', 'admin'));

grant select, insert, update on table public.newsletter_issues to authenticated;
create policy "editors read newsletter issues"
  on public.newsletter_issues for select to authenticated
  using ((select public.current_app_role()) in ('editor', 'admin'));
create policy "editors create newsletter issues"
  on public.newsletter_issues for insert to authenticated
  with check ((select public.current_app_role()) in ('editor', 'admin'));
-- A sent issue is a record of what went out: it can no longer be edited.
create policy "editors update unsent newsletter issues"
  on public.newsletter_issues for update to authenticated
  using ((select public.current_app_role()) in ('editor', 'admin') and status <> 'sent')
  with check ((select public.current_app_role()) in ('editor', 'admin'));

-- Events are inserted by the webhook through the service role: no insert policy.
grant select on table public.newsletter_events to authenticated;
create policy "editors read newsletter events"
  on public.newsletter_events for select to authenticated
  using ((select public.current_app_role()) in ('editor', 'admin'));

-- The cron inserts deliveries through the service role. "Send now" runs as the editor,
-- so editors may insert a delivery and record its provider id, and nothing else.
grant select, insert on table public.newsletter_deliveries to authenticated;
grant update (provider_id) on table public.newsletter_deliveries to authenticated;
create policy "editors read newsletter deliveries"
  on public.newsletter_deliveries for select to authenticated
  using ((select public.current_app_role()) in ('editor', 'admin'));
create policy "editors insert newsletter deliveries"
  on public.newsletter_deliveries for insert to authenticated
  with check ((select public.current_app_role()) in ('editor', 'admin'));
create policy "editors record newsletter delivery provider ids"
  on public.newsletter_deliveries for update to authenticated
  using ((select public.current_app_role()) in ('editor', 'admin'))
  with check ((select public.current_app_role()) in ('editor', 'admin'));

-- ---------------------------------------------------------------------------
-- Public functions
-- ---------------------------------------------------------------------------

-- Ask to join a list. Only the two public list slugs. Returns true when a confirmation
-- mail should go out (a new or re-requested pending row) and false for everything else,
-- so the caller can answer the same way either way. It can never set status active.
create function public.request_newsletter_subscribe(
  email text,
  list_slug text,
  ip_hash text,
  confirm_token_hash text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := pg_catalog.lower(pg_catalog.btrim(coalesce(request_newsletter_subscribe.email, '')));
  v_list_id uuid;
  v_site_id uuid;
  v_attempts integer;
  v_row public.newsletter_subscribers;
begin
  if request_newsletter_subscribe.list_slug is null
     or request_newsletter_subscribe.list_slug not in ('daily', 'weekly')
     or request_newsletter_subscribe.ip_hash is null
     or request_newsletter_subscribe.ip_hash !~ '^[0-9a-f]{64}$'
     or request_newsletter_subscribe.confirm_token_hash is null
     or request_newsletter_subscribe.confirm_token_hash !~ '^[0-9a-f]{64}$'
     or pg_catalog.length(v_email) > 254
     or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  then
    return false;
  end if;

  select l.id, l.site_id into v_list_id, v_site_id
    from public.newsletter_lists l
   where l.slug = request_newsletter_subscribe.list_slug
   order by l.created_at
   limit 1;
  if v_list_id is null then
    return false;
  end if;

  -- Every call counts, including ones that end up doing nothing.
  delete from public.newsletter_signup_attempts a where a.created_at < pg_catalog.now() - interval '1 day';
  insert into public.newsletter_signup_attempts (site_id, ip_hash)
  values (v_site_id, request_newsletter_subscribe.ip_hash);
  select pg_catalog.count(*) into v_attempts
    from public.newsletter_signup_attempts a
   where a.ip_hash = request_newsletter_subscribe.ip_hash
     and a.created_at > pg_catalog.now() - interval '1 hour';
  if v_attempts > 5 then
    return false;
  end if;

  select s.* into v_row
    from public.newsletter_subscribers s
   where s.list_id = v_list_id and s.email = v_email
     for update;

  if not found then
    insert into public.newsletter_subscribers
      (site_id, list_id, email, status, consented_at, ip_hash, confirm_token_hash)
    values
      (v_site_id, v_list_id, v_email, 'pending', pg_catalog.now(),
       request_newsletter_subscribe.ip_hash, request_newsletter_subscribe.confirm_token_hash);
    return true;
  end if;

  if v_row.status not in ('pending', 'unsubscribed') then
    -- active or bounced: change nothing.
    return false;
  end if;

  -- Somebody hammering one pending address does not get a mail per call.
  if v_row.status = 'pending' and v_row.consented_at > pg_catalog.now() - interval '1 minute' then
    return false;
  end if;

  update public.newsletter_subscribers s
     set status = 'pending',
         consented_at = pg_catalog.now(),
         ip_hash = request_newsletter_subscribe.ip_hash,
         confirm_token_hash = request_newsletter_subscribe.confirm_token_hash,
         unsubscribe_token_hash = null,
         unsubscribed_at = null
   where s.id = v_row.id;
  return true;
end;
$$;

-- Confirm with the hash of the emailed token. Only a pending row, within 48 hours of the
-- request. A bounced row is never confirmed. Stores the hash of the unsubscribe token the
-- caller derived; the confirm hash stays so later sends can derive the same token.
create function public.confirm_newsletter(token_hash text, unsubscribe_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if confirm_newsletter.token_hash is null or confirm_newsletter.token_hash !~ '^[0-9a-f]{64}$'
     or confirm_newsletter.unsubscribe_hash is null or confirm_newsletter.unsubscribe_hash !~ '^[0-9a-f]{64}$' then
    return false;
  end if;

  update public.newsletter_subscribers s
     set status = 'active',
         confirmed_at = pg_catalog.now(),
         unsubscribed_at = null,
         unsubscribe_token_hash = confirm_newsletter.unsubscribe_hash
   where s.confirm_token_hash = confirm_newsletter.token_hash
     and s.status = 'pending'
     and s.consented_at > pg_catalog.now() - interval '48 hours';
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

-- What the unsubscribe page shows: the list and a masked address, never the full address.
create function public.newsletter_unsubscribe_info(token_hash text)
returns table (list_name text, email_hint text, status text)
language sql
stable
security definer
set search_path = ''
as $$
  select l.name,
         pg_catalog.left(s.email, 1) || '***@' || pg_catalog.split_part(s.email, '@', 2),
         s.status::text
    from public.newsletter_subscribers s
    join public.newsletter_lists l on l.id = s.list_id
   where newsletter_unsubscribe_info.token_hash ~ '^[0-9a-f]{64}$'
     and s.unsubscribe_token_hash = newsletter_unsubscribe_info.token_hash
   limit 1;
$$;

-- One valid token is enough. Idempotent. A bounced address stays bounced.
create function public.unsubscribe_newsletter(token_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_status public.subscriber_status;
begin
  if unsubscribe_newsletter.token_hash is null or unsubscribe_newsletter.token_hash !~ '^[0-9a-f]{64}$' then
    return false;
  end if;

  select s.status into found_status
    from public.newsletter_subscribers s
   where s.unsubscribe_token_hash = unsubscribe_newsletter.token_hash
   limit 1;
  if not found then
    return false;
  end if;

  update public.newsletter_subscribers s
     set status = 'unsubscribed', unsubscribed_at = pg_catalog.now()
   where s.unsubscribe_token_hash = unsubscribe_newsletter.token_hash
     and s.status in ('active', 'pending');
  return true;
end;
$$;

-- The signed-in reader's own subscriptions, matched on their confirmed auth email.
create function public.my_newsletter_subscriptions()
returns table (id uuid, list_slug text, list_name text, status text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, l.slug, l.name, s.status::text
    from auth.users u
    join public.newsletter_subscribers s on s.email = pg_catalog.lower(u.email)
    join public.newsletter_lists l on l.id = s.list_id
   where u.id = (select auth.uid())
     and u.email_confirmed_at is not null
     and s.status in ('active', 'pending')
   order by l.name;
$$;

create function public.unsubscribe_my_newsletter(subscriber uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  update public.newsletter_subscribers s
     set status = 'unsubscribed', unsubscribed_at = pg_catalog.now()
    from auth.users u
   where s.id = unsubscribe_my_newsletter.subscriber
     and u.id = (select auth.uid())
     and u.email_confirmed_at is not null
     and s.email = pg_catalog.lower(u.email)
     and s.status in ('active', 'pending');
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.request_newsletter_subscribe(text, text, text, text)',
    'public.confirm_newsletter(text, text)',
    'public.newsletter_unsubscribe_info(text)',
    'public.unsubscribe_newsletter(text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to anon, authenticated', fn);
  end loop;
  foreach fn in array array[
    'public.my_newsletter_subscriptions()',
    'public.unsubscribe_my_newsletter(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end;
$$;
