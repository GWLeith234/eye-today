-- 0014_directory_claims.sql — map coordinates, listing claims, owner edit proposals, featured
-- listings, reports, article links and a newsletter switch. Depends on 0013.
--
-- Owners reach their data only through the definer functions below. No new table is readable
-- by anon, and no write path exists for a signed-in user other than those functions.

-- ---------------------------------------------------------------------------
-- Coordinates. Both null or both set.
-- ---------------------------------------------------------------------------

alter table public.directory_listings
  add column lat double precision,
  add column lng double precision,
  add constraint directory_listings_coords check (
    (lat is null and lng is null)
    or (lat is not null and lng is not null and lat between -90 and 90 and lng between -180 and 180)
  );

grant select (lat, lng) on table public.directory_listings to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.listing_claims (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  listing_id uuid not null references public.directory_listings (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  email text not null check (char_length(email) <= 254),
  method text not null check (method in ('email_domain', 'manual')),
  code_hash text check (code_hash is null or code_hash ~ '^[0-9a-f]{64}$'),
  attempts integer not null default 0,
  expires_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected', 'expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index listing_claims_site_id_idx on public.listing_claims (site_id);
create index listing_claims_listing_id_idx on public.listing_claims (listing_id);
create index listing_claims_profile_id_idx on public.listing_claims (profile_id);
create unique index listing_claims_one_pending_idx on public.listing_claims (listing_id, profile_id) where status = 'pending';

create table public.listing_owners (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  listing_id uuid not null references public.directory_listings (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (listing_id, profile_id)
);
create index listing_owners_site_id_idx on public.listing_owners (site_id);
create index listing_owners_profile_id_idx on public.listing_owners (profile_id);

create table public.listing_edit_proposals (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  listing_id uuid not null references public.directory_listings (id) on delete cascade,
  proposer uuid not null references public.profiles (id) on delete cascade,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index listing_edit_proposals_site_id_idx on public.listing_edit_proposals (site_id);
create index listing_edit_proposals_listing_id_idx on public.listing_edit_proposals (listing_id);
create index listing_edit_proposals_proposer_idx on public.listing_edit_proposals (proposer);

create table public.listing_features (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  listing_id uuid not null references public.directory_listings (id) on delete cascade,
  stripe_subscription_id text not null unique,
  stripe_customer_id text,
  status text not null default 'active' check (status in ('active', 'canceled')),
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index listing_features_site_id_idx on public.listing_features (site_id);
create index listing_features_listing_status_idx on public.listing_features (listing_id, status, current_period_end);

create table public.listing_reports (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  listing_id uuid not null references public.directory_listings (id) on delete cascade,
  reporter_profile_id uuid references public.profiles (id) on delete set null,
  reporter_email text not null check (char_length(reporter_email) <= 254),
  reason text not null check (char_length(btrim(reason)) between 1 and 2000),
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index listing_reports_site_id_idx on public.listing_reports (site_id);
create index listing_reports_listing_id_idx on public.listing_reports (listing_id);
create index listing_reports_status_created_idx on public.listing_reports (status, created_at);
create index listing_reports_reporter_idx on public.listing_reports (reporter_profile_id);

create table public.article_listings (
  article_id uuid not null references public.articles (id) on delete cascade,
  listing_id uuid not null references public.directory_listings (id) on delete cascade,
  site_id uuid not null references public.sites (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (article_id, listing_id)
);
create index article_listings_listing_id_idx on public.article_listings (listing_id);
create index article_listings_site_id_idx on public.article_listings (site_id);

do $$
declare
  t text;
begin
  foreach t in array array[
    'listing_claims', 'listing_owners', 'listing_edit_proposals',
    'listing_features', 'listing_reports', 'article_listings'
  ] loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
end;
$$;

alter table public.newsletter_issues add column include_directory boolean not null default false;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function public.is_listing_owner(p_listing uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.listing_owners o
     where o.listing_id = p_listing and o.profile_id = (select auth.uid())
  );
$$;

revoke all on function public.is_listing_owner(uuid) from public, anon, authenticated;
grant execute on function public.is_listing_owner(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Grants and policies. Owners read their own rows; editors read and review; nobody writes directly
-- except editors on the few review columns below.
-- ---------------------------------------------------------------------------

-- code_hash stays out of every select grant, as verification_note does on listings.
grant select (id, site_id, listing_id, profile_id, email, method, attempts, expires_at, status, created_at, updated_at)
  on table public.listing_claims to authenticated;
grant update (status) on table public.listing_claims to authenticated;

create policy "owners and editors read claims"
  on public.listing_claims for select to authenticated
  using (profile_id = (select auth.uid()) or (select public.current_app_role()) in ('editor', 'admin'));

create policy "editors review claims"
  on public.listing_claims for update to authenticated
  using ((select public.current_app_role()) in ('editor', 'admin'))
  with check ((select public.current_app_role()) in ('editor', 'admin'));

grant select, delete on table public.listing_owners to authenticated;

create policy "owners and editors read owners"
  on public.listing_owners for select to authenticated
  using (profile_id = (select auth.uid()) or (select public.current_app_role()) in ('editor', 'admin'));

create policy "editors remove owners"
  on public.listing_owners for delete to authenticated
  using ((select public.current_app_role()) in ('editor', 'admin'));

grant select on table public.listing_edit_proposals to authenticated;
grant update (status) on table public.listing_edit_proposals to authenticated;

create policy "proposers and editors read proposals"
  on public.listing_edit_proposals for select to authenticated
  using (proposer = (select auth.uid()) or (select public.current_app_role()) in ('editor', 'admin'));

create policy "editors review proposals"
  on public.listing_edit_proposals for update to authenticated
  using ((select public.current_app_role()) in ('editor', 'admin'))
  with check ((select public.current_app_role()) in ('editor', 'admin'));

-- Stripe ids stay out of the grant. The webhook writes through the service role.
grant select (id, site_id, listing_id, status, current_period_end, created_at, updated_at)
  on table public.listing_features to authenticated;

create policy "owners and editors read features"
  on public.listing_features for select to authenticated
  using (public.is_listing_owner(listing_id) or (select public.current_app_role()) in ('editor', 'admin'));

grant select on table public.listing_reports to authenticated;
grant update (status) on table public.listing_reports to authenticated;

create policy "editors read reports"
  on public.listing_reports for select to authenticated
  using ((select public.current_app_role()) in ('editor', 'admin'));

create policy "editors close reports"
  on public.listing_reports for update to authenticated
  using ((select public.current_app_role()) in ('editor', 'admin'))
  with check ((select public.current_app_role()) in ('editor', 'admin'));

grant select, insert, delete on table public.article_listings to authenticated;

create policy "editors read article listings"
  on public.article_listings for select to authenticated
  using ((select public.current_app_role()) in ('editor', 'admin'));

create policy "editors attach listings"
  on public.article_listings for insert to authenticated
  with check ((select public.current_app_role()) in ('editor', 'admin'));

create policy "editors detach listings"
  on public.article_listings for delete to authenticated
  using ((select public.current_app_role()) in ('editor', 'admin'));

-- ---------------------------------------------------------------------------
-- Claims
-- ---------------------------------------------------------------------------

-- Website host, lower case. Null when the address is not https.
create function public._listing_host(p_website text)
returns text
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.lower(substring(p_website from '^https://([^/:?#[:space:]]+)'));
$$;

revoke all on function public._listing_host(text) from public, anon, authenticated;

-- Eligibility only. The code is made and mailed by the server (see set_listing_claim_code). Returns the claim id.
create function public.request_listing_claim(p_listing_id uuid, p_email text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  mail text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_email, '')));
  l public.directory_listings;
  host text;
  recent integer;
  claim_id uuid;
  claim_touched timestamptz;
begin
  if me is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  if mail !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or pg_catalog.char_length(mail) > 254 then
    raise exception 'invalid claim' using errcode = '23514';
  end if;

  select * into l from public.directory_listings d where d.id = p_listing_id and d.status = 'published';
  if not found then
    raise exception 'invalid claim' using errcode = '23514';
  end if;
  if exists (select 1 from public.listing_owners o where o.listing_id = l.id and o.profile_id = me) then
    raise exception 'already owner' using errcode = 'P0001';
  end if;

  host := public._listing_host(l.website);
  -- The domain must equal the website host, or that host without a leading "www.".
  if host is null or host = ''
     or pg_catalog.split_part(mail, '@', 2) not in (host, pg_catalog.regexp_replace(host, '^www\.', '')) then
    raise exception 'domain mismatch' using errcode = 'P0001';
  end if;

  select count(*) into recent from public.listing_claims c
   where c.profile_id = me and c.created_at > pg_catalog.now() - interval '1 hour';
  if recent >= 5 then
    raise exception 'too many claims' using errcode = 'P0001';
  end if;

  select c.id, c.updated_at into claim_id, claim_touched
    from public.listing_claims c
   where c.listing_id = l.id and c.profile_id = me and c.status = 'pending';
  if claim_id is not null then
    -- One live claim. Asking again re-issues the code, but not more than once a minute.
    if claim_touched > pg_catalog.now() - interval '1 minute' then
      raise exception 'too many claims' using errcode = 'P0001';
    end if;
    update public.listing_claims
       set email = mail, method = 'email_domain', code_hash = null, expires_at = null, attempts = 0
     where id = claim_id;
    return claim_id;
  end if;

  insert into public.listing_claims (site_id, listing_id, profile_id, email, method, status)
  values (l.site_id, l.id, me, mail, 'email_domain', 'pending')
  returning id into claim_id;
  return claim_id;
end;
$$;

-- Service role only. The code is chosen by the server, never by the person claiming: if a user could
-- pick the hash they could skip the email proof. Returns the address the code must be mailed to.
create function public.set_listing_claim_code(p_claim_id uuid, p_code_hash text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  mail text;
begin
  if p_code_hash is null or p_code_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid code' using errcode = '23514';
  end if;
  update public.listing_claims c
     set code_hash = p_code_hash,
         expires_at = pg_catalog.now() + interval '30 minutes',
         attempts = 0
   where c.id = p_claim_id and c.status = 'pending' and c.method = 'email_domain'
  returning c.email into mail;
  return mail;
end;
$$;

revoke all on function public.set_listing_claim_code(uuid, text) from public, anon, authenticated;
grant execute on function public.set_listing_claim_code(uuid, text) to service_role;

-- Wrong code, expired, someone else's claim and "no such claim" all answer false.
create function public.confirm_listing_claim(p_listing_id uuid, p_code text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  c public.listing_claims;
  ok boolean;
begin
  if me is null then
    return false;
  end if;

  select * into c from public.listing_claims x
   where x.listing_id = p_listing_id and x.profile_id = me and x.status = 'pending' and x.method = 'email_domain'
     for update;
  if not found or c.code_hash is null or c.expires_at is null then
    return false;
  end if;
  if c.expires_at <= pg_catalog.now() or c.attempts >= 5 then
    update public.listing_claims set status = 'expired' where id = c.id;
    return false;
  end if;

  ok := p_code is not null
        and c.code_hash = pg_catalog.encode(extensions.digest(pg_catalog.btrim(p_code), 'sha256'), 'hex');
  if not ok then
    update public.listing_claims set attempts = attempts + 1 where id = c.id;
    return false;
  end if;

  update public.listing_claims set status = 'verified', code_hash = null where id = c.id;
  insert into public.listing_owners (site_id, listing_id, profile_id)
  values (c.site_id, c.listing_id, c.profile_id)
  on conflict (listing_id, profile_id) do nothing;
  return true;
end;
$$;

-- A person whose domain does not match asks an editor instead.
create function public.request_manual_listing_claim(p_listing_id uuid, p_email text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  mail text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_email, '')));
  l public.directory_listings;
  recent integer;
  claim_id uuid;
begin
  if me is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  if mail !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or pg_catalog.char_length(mail) > 254 then
    raise exception 'invalid claim' using errcode = '23514';
  end if;
  select * into l from public.directory_listings d where d.id = p_listing_id and d.status = 'published';
  if not found then
    raise exception 'invalid claim' using errcode = '23514';
  end if;
  if exists (select 1 from public.listing_owners o where o.listing_id = l.id and o.profile_id = me) then
    raise exception 'already owner' using errcode = 'P0001';
  end if;
  select count(*) into recent from public.listing_claims c
   where c.profile_id = me and c.created_at > pg_catalog.now() - interval '1 hour';
  if recent >= 5 then
    raise exception 'too many claims' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.listing_claims c where c.listing_id = l.id and c.profile_id = me and c.status = 'pending') then
    raise exception 'claim pending' using errcode = 'P0001';
  end if;
  insert into public.listing_claims (site_id, listing_id, profile_id, email, method, status)
  values (l.site_id, l.id, me, mail, 'manual', 'pending')
  returning id into claim_id;
  return claim_id;
end;
$$;

-- Editors only. A manual claim becomes ownership.
create function public.approve_listing_claim(p_claim_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c public.listing_claims;
begin
  if (select public.current_app_role()) not in ('editor', 'admin') then
    raise exception 'editors only' using errcode = '42501';
  end if;
  select * into c from public.listing_claims x where x.id = p_claim_id and x.status = 'pending' and x.method = 'manual' for update;
  if not found then
    return false;
  end if;
  update public.listing_claims set status = 'verified' where id = c.id;
  insert into public.listing_owners (site_id, listing_id, profile_id)
  values (c.site_id, c.listing_id, c.profile_id)
  on conflict (listing_id, profile_id) do nothing;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Owner edits. The whitelist is the enforcement: verification_level, verification_note, status,
-- relationship_disclosure, lat and lng are not in it, in either function.
-- ---------------------------------------------------------------------------

create function public.propose_listing_edit(p_listing_id uuid, p_payload jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  l public.directory_listings;
  clean jsonb := '{}'::jsonb;
  k text;
  v jsonb;
  item text;
  pending_count integer;
  proposal_id uuid;
begin
  if me is null or not exists (select 1 from public.listing_owners o where o.listing_id = p_listing_id and o.profile_id = me) then
    raise exception 'owners only' using errcode = '42501';
  end if;
  select * into l from public.directory_listings d where d.id = p_listing_id and d.status = 'published';
  if not found or p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object' then
    raise exception 'invalid proposal' using errcode = '23514';
  end if;

  select count(*) into pending_count from public.listing_edit_proposals p
   where p.listing_id = l.id and p.proposer = me and p.status = 'pending';
  if pending_count >= 3 then
    raise exception 'too many proposals' using errcode = 'P0001';
  end if;

  for k, v in select * from pg_catalog.jsonb_each(p_payload) loop
    if k in ('name', 'country_code', 'region', 'city', 'website', 'public_email', 'public_phone', 'description') then
      if pg_catalog.jsonb_typeof(v) <> 'string' then
        raise exception 'invalid proposal' using errcode = '23514';
      end if;
      clean := clean || pg_catalog.jsonb_build_object(k, pg_catalog.btrim(v #>> '{}'));
    elsif k in ('services', 'languages') then
      if pg_catalog.jsonb_typeof(v) <> 'array' or pg_catalog.jsonb_array_length(v) > 20 then
        raise exception 'invalid proposal' using errcode = '23514';
      end if;
      for item in select * from pg_catalog.jsonb_array_elements_text(v) loop
        if pg_catalog.char_length(pg_catalog.btrim(item)) not between 1 and 40 or item ~ '[<>]' then
          raise exception 'invalid proposal' using errcode = '23514';
        end if;
      end loop;
      clean := clean || pg_catalog.jsonb_build_object(k, v);
    end if;
    -- Every other key, verification_level included, is dropped.
  end loop;

  if clean = '{}'::jsonb
     or pg_catalog.char_length(coalesce(clean ->> 'name', 'x')) not between 1 and 160
     or pg_catalog.char_length(coalesce(clean ->> 'description', '')) > 2000
     or coalesce(clean ->> 'description', '') ~ '[<>]'
     or (clean ? 'country_code' and upper(clean ->> 'country_code') !~ '^[A-Z]{2}$')
     or (clean ? 'website' and (clean ->> 'website') <> '' and (clean ->> 'website') !~ '^https://[^[:space:]]+$')
     or (clean ? 'public_email' and (clean ->> 'public_email') <> '' and (clean ->> 'public_email') !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then
    raise exception 'invalid proposal' using errcode = '23514';
  end if;

  insert into public.listing_edit_proposals (site_id, listing_id, proposer, payload)
  values (l.site_id, l.id, me, clean)
  returning id into proposal_id;
  return proposal_id;
end;
$$;

-- Editors only. Returns the old and new slug and country so the app can refresh both sets of paths.
create function public.approve_listing_proposal(p_id uuid)
returns table (old_slug text, new_slug text, old_country text, new_country text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  pr public.listing_edit_proposals;
  p jsonb;
  before_row public.directory_listings;
begin
  if (select public.current_app_role()) not in ('editor', 'admin') then
    raise exception 'editors only' using errcode = '42501';
  end if;
  select * into pr from public.listing_edit_proposals x where x.id = p_id and x.status = 'pending' for update;
  if not found then
    raise exception 'not pending' using errcode = 'P0001';
  end if;
  p := pr.payload;
  select * into before_row from public.directory_listings d where d.id = pr.listing_id for update;

  -- Only these columns are ever written.
  update public.directory_listings d set
    name = coalesce(nullif(p ->> 'name', ''), d.name),
    country_code = coalesce(nullif(upper(p ->> 'country_code'), ''), d.country_code),
    region = case when p ? 'region' then nullif(p ->> 'region', '') else d.region end,
    city = case when p ? 'city' then nullif(p ->> 'city', '') else d.city end,
    website = case when p ? 'website' then nullif(p ->> 'website', '') else d.website end,
    public_email = case when p ? 'public_email' then nullif(p ->> 'public_email', '') else d.public_email end,
    public_phone = case when p ? 'public_phone' then nullif(p ->> 'public_phone', '') else d.public_phone end,
    description = case when p ? 'description' then coalesce(p ->> 'description', '') else d.description end,
    services = case when p ? 'services' then array(select pg_catalog.jsonb_array_elements_text(p -> 'services')) else d.services end,
    languages = case when p ? 'languages' then array(select pg_catalog.jsonb_array_elements_text(p -> 'languages')) else d.languages end
  where d.id = pr.listing_id;

  update public.listing_edit_proposals set status = 'approved' where id = pr.id;

  return query
    select before_row.slug, d.slug, before_row.country_code, d.country_code
      from public.directory_listings d where d.id = pr.listing_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------

create function public.report_listing(p_listing_id uuid, p_email text, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  mail text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_email, '')));
  why text := pg_catalog.btrim(coalesce(p_reason, ''));
  l public.directory_listings;
  recent integer;
begin
  if mail !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
     or pg_catalog.char_length(mail) > 254
     or pg_catalog.char_length(why) not between 1 and 2000 then
    raise exception 'invalid report' using errcode = '23514';
  end if;
  select * into l from public.directory_listings d where d.id = p_listing_id and d.status = 'published';
  if not found then
    raise exception 'invalid report' using errcode = '23514';
  end if;

  select count(*) into recent from public.listing_reports r
   where r.reporter_email = mail and r.created_at > pg_catalog.now() - interval '24 hours';
  if recent >= 5 then
    raise exception 'too many reports' using errcode = 'P0001';
  end if;
  select count(*) into recent from public.listing_reports r
   where r.site_id = l.site_id and r.created_at > pg_catalog.now() - interval '24 hours';
  if recent >= 200 then
    raise exception 'too many reports' using errcode = 'P0001';
  end if;

  insert into public.listing_reports (site_id, listing_id, reporter_profile_id, reporter_email, reason)
  values (l.site_id, l.id, (select auth.uid()), mail, why);
end;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.request_listing_claim(uuid, text)',
    'public.confirm_listing_claim(uuid, text)',
    'public.request_manual_listing_claim(uuid, text)',
    'public.approve_listing_claim(uuid)',
    'public.propose_listing_edit(uuid, jsonb)',
    'public.approve_listing_proposal(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
  revoke all on function public.report_listing(uuid, text, text) from public, anon, authenticated;
  grant execute on function public.report_listing(uuid, text, text) to anon, authenticated;
end;
$$;

-- ---------------------------------------------------------------------------
-- Public reads. One card shape for search, map, article links and the listing page.
-- ---------------------------------------------------------------------------

drop function public.directory_search(text, text, text, text, text, integer);
drop function public.directory_listing(text);

create type public.directory_card as (
  name text,
  slug text,
  category_slug text,
  category_name text,
  country_code text,
  region text,
  city text,
  services text[],
  verification_level text,
  description text,
  logo_storage_path text,
  logo_alt text,
  has_legal boolean,
  lat double precision,
  lng double precision,
  relationship_disclosure text,
  featured boolean
);

-- Page 1 pins at most 3 featured matches (a feature counts only while active and unexpired), then
-- the rest in the usual order. Every page is the same ordering at the next offset, so a listing is
-- never repeated or skipped, and each one appears once. A fourth featured match ranks organically.
create function public.directory_search(
  q text,
  country_code text,
  category_slug text,
  service text,
  verification text,
  page integer
) returns setof public.directory_card
language sql
stable
security definer
set search_path = ''
as $$
  with m as (
    select l.id, l.name as lname, match.rank,
           exists (
             select 1 from public.listing_features f
              where f.listing_id = l.id
                and f.site_id = l.site_id
                and f.status = 'active'
                and f.current_period_end > pg_catalog.now()
           ) as is_featured
      from public._directory_match(
             directory_search.q,
             directory_search.country_code,
             directory_search.category_slug,
             directory_search.service,
             directory_search.verification
           ) match
      join public.directory_listings l on l.id = match.id
  ), f as (
    select m.*,
           case when m.is_featured
                then pg_catalog.row_number() over (partition by m.is_featured order by m.rank desc, m.lname, m.id)
           end as frn
      from m
  ), o as (
    select f.*, (f.frn is not null and f.frn <= 3) as pinned from f
  )
  select l.name, l.slug, c.slug, c.name, l.country_code, l.region, l.city, l.services,
         l.verification_level::text, l.description, md.storage_path, md.alt,
         exists (
           select 1 from public.country_legal_status s
            where s.site_id = l.site_id and s.country_code = l.country_code and s.status = 'published'
         ),
         l.lat, l.lng, l.relationship_disclosure, o.pinned
    from o
    join public.directory_listings l on l.id = o.id
    join public.directory_categories c on c.id = l.category_id
    left join public.media md on md.id = l.logo_media_id
   order by o.pinned desc, o.rank desc, l.name asc, l.id
   limit 24
   offset (greatest(1, least(coalesce(directory_search.page, 1), 100)) - 1) * 24;
$$;

-- Same card for the listing page, with its id for claims and reports. directory_search_count is unchanged.
create function public.directory_listing(slug text)
returns table (
  id uuid,
  name text,
  slug text,
  category_slug text,
  category_name text,
  country_code text,
  region text,
  city text,
  services text[],
  languages text[],
  website text,
  public_email text,
  public_phone text,
  description text,
  verification_level text,
  relationship_disclosure text,
  last_reviewed_at timestamptz,
  logo_storage_path text,
  logo_alt text,
  photo_paths text[],
  photo_alts text[],
  has_legal boolean,
  lat double precision,
  lng double precision,
  featured boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, l.name, l.slug, c.slug, c.name, l.country_code, l.region, l.city, l.services, l.languages,
         l.website, l.public_email, l.public_phone, l.description, l.verification_level::text,
         l.relationship_disclosure, l.last_reviewed_at, m.storage_path, m.alt,
         coalesce((
           select pg_catalog.array_agg(photo.storage_path order by ids.ord)
             from pg_catalog.unnest(l.photo_media_ids) with ordinality as ids(media_id, ord)
             join public.media photo on photo.id = ids.media_id
         ), '{}'),
         coalesce((
           select pg_catalog.array_agg(coalesce(photo.alt, '') order by ids.ord)
             from pg_catalog.unnest(l.photo_media_ids) with ordinality as ids(media_id, ord)
             join public.media photo on photo.id = ids.media_id
         ), '{}'),
         exists (
           select 1 from public.country_legal_status s
            where s.site_id = l.site_id and s.country_code = l.country_code and s.status = 'published'
         ),
         l.lat, l.lng,
         exists (
           select 1 from public.listing_features f
            where f.listing_id = l.id and f.site_id = l.site_id and f.status = 'active'
              and f.current_period_end > pg_catalog.now()
         )
    from public.directory_listings l
    join public.directory_categories c on c.id = l.category_id and c.hidden = false
    left join public.media m on m.id = l.logo_media_id
   where l.status = 'published'
     and l.slug = pg_catalog.btrim(directory_listing.slug)
   limit 1;
$$;

-- Published listings attached to a live article. Only when both are published.
create function public.article_directory_cards(p_article uuid)
returns setof public.directory_card
language sql
stable
security definer
set search_path = ''
as $$
  select l.name, l.slug, c.slug, c.name, l.country_code, l.region, l.city, l.services,
         l.verification_level::text, l.description, md.storage_path, md.alt,
         exists (
           select 1 from public.country_legal_status s
            where s.site_id = l.site_id and s.country_code = l.country_code and s.status = 'published'
         ),
         l.lat, l.lng, l.relationship_disclosure, false
    from public.article_listings al
    join public._live_articles() a on a.id = al.article_id
    join public.directory_listings l on l.id = al.listing_id and l.status = 'published'
    join public.directory_categories c on c.id = l.category_id and c.hidden = false
    left join public.media md on md.id = l.logo_media_id
   where al.article_id = p_article
   order by l.name, l.id
   limit 6;
$$;

-- Stories for a listing page: by its service tags, plus stories an editor attached to it.
create function public.directory_listing_stories(p_listing uuid, service_slugs text[])
returns setof public.article_card
language sql
stable
security definer
set search_path = ''
as $$
  select s.title, s.dek, s.article_slug, s.section_slug, s.section_name, s.published_at,
         s.hero_storage_path, s.hero_alt, s.hero_credit, s.hero_width, s.hero_height, s.is_sponsored, s.byline
    from (
      select l.id, l.title, l.dek, l.article_slug, l.section_slug, l.section_name, l.published_at,
             l.hero_storage_path, l.hero_alt, l.hero_credit, l.hero_width, l.hero_height, l.is_sponsored, l.byline
        from public._live_articles() l
        join public.article_listings al on al.article_id = l.id
        join public.directory_listings dl on dl.id = al.listing_id and dl.status = 'published'
       where al.listing_id = p_listing
      union
      select l.id, l.title, l.dek, l.article_slug, l.section_slug, l.section_name, l.published_at,
             l.hero_storage_path, l.hero_alt, l.hero_credit, l.hero_width, l.hero_height, l.is_sponsored, l.byline
        from public._live_articles() l
        join public.article_tags at on at.article_id = l.id
        join public.tags t on t.id = at.tag_id
       where t.slug = any (coalesce(directory_listing_stories.service_slugs, '{}'))
    ) s
   order by s.published_at desc, s.id
   limit 4;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.directory_search(text, text, text, text, text, integer)',
    'public.directory_listing(text)',
    'public.article_directory_cards(uuid)',
    'public.directory_listing_stories(uuid, text[])'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to anon, authenticated', fn);
  end loop;
end;
$$;
