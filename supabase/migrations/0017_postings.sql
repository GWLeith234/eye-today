-- 0017_postings.sql — paid job board and classifieds.
--
-- postings holds both boards (kind = job | classified). Posters (any signed-in reader) write only through
-- save_posting, a definer function; a paid Stripe checkout reaches apply_posting_payment through the
-- service-role webhook; editors approve, reject and edit under RLS. Anon has no table privileges: public
-- pages read through the definer functions at the bottom, which only return a published posting before
-- its expiry and closing date, and never the poster's contact email or payment details.

create table public.postings (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  kind text not null check (kind in ('job', 'classified')),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and slug not in ('submit', 'new', 'policy')),
  title text not null check (char_length(btrim(title)) between 1 and 160 and title !~ '[<>]'),
  organisation text not null check (char_length(btrim(organisation)) between 1 and 160 and organisation !~ '[<>]'),
  listing_id uuid references public.directory_listings (id) on delete set null,
  location text check (location is null or (char_length(location) <= 160 and location !~ '[<>]')),
  country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  remote text not null default 'onsite' check (remote in ('onsite', 'remote', 'hybrid')),
  employment_type text check (
    employment_type is null
    or employment_type in ('full_time', 'part_time', 'contract', 'temporary', 'internship', 'volunteer')
  ),
  category text check (category is null or category in ('training', 'services', 'retreats', 'other')),
  salary_min integer check (salary_min is null or salary_min between 0 and 100000000),
  salary_max integer check (salary_max is null or salary_max between 0 and 100000000),
  salary_currency text check (salary_currency is null or salary_currency ~ '^[A-Z]{3}$'),
  salary_period text check (salary_period is null or salary_period in ('hour', 'month', 'year')),
  description_html text not null default '' check (char_length(description_html) <= 40000),
  apply_url text check (apply_url is null or (char_length(apply_url) <= 500 and apply_url ~ '^https://[^[:space:]<>"]+$')),
  apply_email text check (apply_email is null or (char_length(apply_email) <= 254 and apply_email ~ '^[^@[:space:]<>]+@[^@[:space:]<>]+\.[^@[:space:]<>]+$')),
  closing_date date,
  poster_id uuid not null references public.profiles (id) on delete cascade,
  contact_email text not null check (char_length(contact_email) <= 254),
  status text not null default 'draft' check (status in ('draft', 'pending', 'published', 'expired', 'rejected')),
  reject_reason text check (reject_reason is null or char_length(reject_reason) <= 500),
  paid_days integer not null default 0 check (paid_days between 0 and 3650),
  approved_at timestamptz,
  published_at timestamptz,
  expires_at timestamptz,
  reviewed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, slug),
  check ((kind = 'job' and employment_type is not null and category is null)
      or (kind = 'classified' and category is not null and employment_type is null)),
  check (salary_min is null or salary_max is null or salary_max >= salary_min),
  check ((salary_min is null and salary_max is null) or salary_currency is not null),
  check (apply_url is not null or apply_email is not null),
  check (remote = 'remote' or location is not null),
  check (status <> 'published' or expires_at is not null)
);
create index postings_public_idx on public.postings (site_id, kind, status, expires_at);
create index postings_poster_created_idx on public.postings (poster_id, created_at);
create index postings_site_created_idx on public.postings (site_id, created_at);
create index postings_listing_id_idx on public.postings (listing_id);
create index postings_reviewed_by_idx on public.postings (reviewed_by);

create trigger set_updated_at
  before update on public.postings
  for each row execute function public.set_updated_at();

-- One row per paid checkout. The unique session id makes a replayed webhook a no-op.
create table public.posting_payments (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  posting_id uuid not null references public.postings (id) on delete cascade,
  profile_id uuid references public.profiles (id) on delete set null,
  stripe_checkout_session_id text not null unique check (char_length(stripe_checkout_session_id) <= 255),
  stripe_payment_intent_id text check (stripe_payment_intent_id is null or char_length(stripe_payment_intent_id) <= 255),
  days integer not null check (days in (30, 60)),
  amount_cents integer check (amount_cents is null or amount_cents >= 0),
  currency text check (currency is null or currency ~ '^[a-z]{3}$'),
  created_at timestamptz not null default now()
);
create index posting_payments_posting_idx on public.posting_payments (posting_id);
create index posting_payments_site_id_idx on public.posting_payments (site_id);
create index posting_payments_profile_id_idx on public.posting_payments (profile_id);

-- The fields only editors, the owner (migrations, tests, definer functions) and the service role may set.
-- Anyone else gets a fresh draft on insert and keeps the old values on update.
create function public.postings_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.title := pg_catalog.btrim(new.title);
  new.organisation := pg_catalog.btrim(new.organisation);
  new.location := nullif(pg_catalog.btrim(coalesce(new.location, '')), '');
  new.country_code := nullif(upper(pg_catalog.btrim(coalesce(new.country_code, ''))), '');
  new.salary_currency := nullif(upper(pg_catalog.btrim(coalesce(new.salary_currency, ''))), '');
  new.apply_url := nullif(pg_catalog.btrim(coalesce(new.apply_url, '')), '');
  new.apply_email := nullif(pg_catalog.lower(pg_catalog.btrim(coalesce(new.apply_email, ''))), '');

  if exists (
       select 1 from pg_catalog.pg_class c
        where c.oid = 'public.postings'::pg_catalog.regclass
          and pg_catalog.pg_has_role(current_user, c.relowner, 'MEMBER')
     )
     or pg_catalog.pg_has_role(current_user, 'service_role', 'MEMBER')
     or (select public.current_app_role()) in ('editor', 'admin') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.status := 'draft';
    new.paid_days := 0;
    new.approved_at := null;
    new.published_at := null;
    new.expires_at := null;
    new.reviewed_by := null;
    new.reject_reason := null;
  else
    new.status := old.status;
    new.paid_days := old.paid_days;
    new.approved_at := old.approved_at;
    new.published_at := old.published_at;
    new.expires_at := old.expires_at;
    new.reviewed_by := old.reviewed_by;
    new.reject_reason := old.reject_reason;
    new.poster_id := old.poster_id;
  end if;
  return new;
end;
$$;

revoke all on function public.postings_before_write() from public, anon, authenticated;

create trigger postings_before_write
  before insert or update on public.postings
  for each row execute function public.postings_before_write();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.postings enable row level security;
alter table public.postings force row level security;
alter table public.posting_payments enable row level security;
alter table public.posting_payments force row level security;
revoke all on table public.postings from anon, authenticated;
revoke all on table public.posting_payments from anon, authenticated;

grant select, insert, update, delete on table public.postings to authenticated;
grant select on table public.posting_payments to authenticated;

create policy "posters read their own postings"
  on public.postings for select to authenticated
  using (poster_id = (select auth.uid()));

create policy "editors read postings"
  on public.postings for select to authenticated
  using ((select public.current_app_role()) in ('editor', 'admin'));

create policy "editors insert postings"
  on public.postings for insert to authenticated
  with check ((select public.current_app_role()) in ('editor', 'admin'));

create policy "editors update postings"
  on public.postings for update to authenticated
  using ((select public.current_app_role()) in ('editor', 'admin'))
  with check ((select public.current_app_role()) in ('editor', 'admin'));

create policy "editors delete postings"
  on public.postings for delete to authenticated
  using ((select public.current_app_role()) in ('editor', 'admin'));

create policy "posters read their own payments"
  on public.posting_payments for select to authenticated
  using (profile_id = (select auth.uid()));

create policy "editors read payments"
  on public.posting_payments for select to authenticated
  using ((select public.current_app_role()) in ('editor', 'admin'));

-- ---------------------------------------------------------------------------
-- Poster writes
-- ---------------------------------------------------------------------------

-- Creates a draft (p_id null) or edits the caller's own posting. Editing anything already submitted sends
-- it back to an editor (pending); an expired posting must be renewed before it can be edited.
create function public.save_posting(
  p_id uuid,
  p_kind text,
  p_title text,
  p_organisation text,
  p_listing_slug text,
  p_location text,
  p_country text,
  p_remote text,
  p_employment_type text,
  p_category text,
  p_salary_min integer,
  p_salary_max integer,
  p_salary_currency text,
  p_salary_period text,
  p_description text,
  p_apply_url text,
  p_apply_email text,
  p_closing_date date
) returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  site uuid;
  email text;
  recent integer;
  listing uuid;
  base text;
  candidate text;
  attempt integer := 0;
  row_ public.postings;
  clean_title text := pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(p_title, '')), '[<>]', '', 'g');
  clean_org text := pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(p_organisation, '')), '[<>]', '', 'g');
  saved uuid;
begin
  if me is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if coalesce(p_kind, '') not in ('job', 'classified')
     or pg_catalog.char_length(clean_title) not between 1 and 160
     or pg_catalog.char_length(clean_org) not between 1 and 160
     or pg_catalog.char_length(coalesce(p_description, '')) > 6000
     or pg_catalog.char_length(pg_catalog.btrim(coalesce(p_description, ''))) < 20
     or (p_closing_date is not null and (p_closing_date < (pg_catalog.now() at time zone 'UTC')::date
                                          or p_closing_date > (pg_catalog.now() at time zone 'UTC')::date + 365)) then
    raise exception 'invalid posting' using errcode = '23514';
  end if;

  select s.id into site from public.sites s where s.slug = 'eyetoday';
  select u.email into email from auth.users u where u.id = me;
  if site is null or email is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if pg_catalog.btrim(coalesce(p_listing_slug, '')) <> '' then
    select l.id into listing
      from public.directory_listings l
      join public.directory_categories c on c.id = l.category_id and c.hidden = false
     where l.site_id = site and l.slug = pg_catalog.btrim(p_listing_slug) and l.status = 'published';
    if listing is null then
      raise exception 'invalid listing' using errcode = '23514';
    end if;
  end if;

  if p_id is null then
    select count(*) into recent from public.postings p
     where p.poster_id = me and p.created_at > pg_catalog.now() - interval '24 hours';
    if recent >= 10 then
      raise exception 'too many postings' using errcode = 'P0001';
    end if;
    select count(*) into recent from public.postings p
     where p.site_id = site and p.created_at > pg_catalog.now() - interval '24 hours';
    if recent >= 200 then
      raise exception 'too many postings' using errcode = 'P0001';
    end if;

    base := pg_catalog.btrim(pg_catalog.regexp_replace(pg_catalog.lower(clean_title), '[^a-z0-9]+', '-', 'g'), '-');
    base := pg_catalog.btrim(pg_catalog.left(base, 80), '-');
    if base = '' or base in ('submit', 'new', 'policy') then
      base := p_kind;
    end if;
    candidate := base;
    while exists (select 1 from public.postings p where p.site_id = site and p.slug = candidate) loop
      attempt := attempt + 1;
      if attempt > 10 then
        raise exception 'invalid posting' using errcode = '23514';
      end if;
      candidate := base || '-' || pg_catalog.left(pg_catalog.md5(pg_catalog.gen_random_uuid()::text), 6);
    end loop;

    insert into public.postings (
      site_id, kind, slug, title, organisation, listing_id, location, country_code, remote, employment_type,
      category, salary_min, salary_max, salary_currency, salary_period, description_html, apply_url,
      apply_email, closing_date, poster_id, contact_email, status
    ) values (
      site, p_kind, candidate, clean_title, clean_org, listing,
      nullif(pg_catalog.left(pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(p_location, '')), '[<>]', '', 'g'), 160), ''),
      p_country, coalesce(p_remote, 'onsite'),
      case when p_kind = 'job' then p_employment_type end,
      case when p_kind = 'classified' then p_category end,
      p_salary_min, p_salary_max, p_salary_currency, case when p_salary_min is null and p_salary_max is null then null else p_salary_period end,
      public._event_description_html(p_description),
      p_apply_url, p_apply_email, p_closing_date, me, pg_catalog.lower(email), 'draft'
    ) returning id into saved;
    return saved;
  end if;

  select * into row_ from public.postings p where p.id = p_id and p.poster_id = me for update;
  -- Past its expiry counts as expired even before the cron flips the status.
  if row_.id is null or row_.status = 'expired' or (row_.status = 'published' and row_.expires_at <= pg_catalog.now()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if row_.kind <> p_kind then
    raise exception 'invalid posting' using errcode = '23514';
  end if;

  update public.postings p set
    title = clean_title,
    organisation = clean_org,
    listing_id = listing,
    location = nullif(pg_catalog.left(pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(p_location, '')), '[<>]', '', 'g'), 160), ''),
    country_code = p_country,
    remote = coalesce(p_remote, 'onsite'),
    employment_type = case when p_kind = 'job' then p_employment_type end,
    category = case when p_kind = 'classified' then p_category end,
    salary_min = p_salary_min,
    salary_max = p_salary_max,
    salary_currency = p_salary_currency,
    salary_period = case when p_salary_min is null and p_salary_max is null then null else p_salary_period end,
    description_html = public._event_description_html(p_description),
    apply_url = p_apply_url,
    apply_email = p_apply_email,
    closing_date = p_closing_date,
    status = case when row_.status = 'draft' then 'draft' else 'pending' end,
    reject_reason = null
   where p.id = row_.id;
  return row_.id;
end;
$$;

revoke all on function public.save_posting(uuid, text, text, text, text, text, text, text, text, text, integer, integer, text, text, text, text, text, date) from public, anon, authenticated;
grant execute on function public.save_posting(uuid, text, text, text, text, text, text, text, text, text, integer, integer, text, text, text, text, text, date) to authenticated;

-- Editors save a posting's description through the same escaping as save_posting.
create function public.posting_description_preview(p_text text)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select public._event_description_html(pg_catalog.left(coalesce(p_text, ''), 6000));
$$;

revoke all on function public.posting_description_preview(text) from public, anon, authenticated;
grant execute on function public.posting_description_preview(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Payments (service role, from the verified Stripe webhook)
-- ---------------------------------------------------------------------------

-- Returns what happened: duplicate, no_posting, pending, extended, renewed.
create function public.apply_posting_payment(
  p_session text,
  p_posting uuid,
  p_profile uuid,
  p_days integer,
  p_amount integer,
  p_currency text,
  p_payment_intent text
) returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  row_ public.postings;
  outcome text;
begin
  if p_days not in (30, 60) or p_session is null then
    raise exception 'invalid payment' using errcode = '23514';
  end if;
  if exists (select 1 from public.posting_payments pp where pp.stripe_checkout_session_id = p_session) then
    return 'duplicate';
  end if;
  select * into row_ from public.postings p where p.id = p_posting and p.poster_id = p_profile for update;
  if row_.id is null then
    return 'no_posting';
  end if;

  insert into public.posting_payments (site_id, posting_id, profile_id, stripe_checkout_session_id, stripe_payment_intent_id, days, amount_cents, currency)
  values (row_.site_id, row_.id, p_profile, p_session, p_payment_intent, p_days, p_amount, pg_catalog.lower(p_currency));

  if row_.status = 'published' and row_.expires_at > pg_catalog.now() then
    update public.postings p set expires_at = row_.expires_at + pg_catalog.make_interval(days => p_days) where p.id = row_.id;
    outcome := 'extended';
  elsif row_.status in ('published', 'expired') and row_.approved_at is not null then
    -- Renewing an approved posting whose text has not changed since: back up at once for the paid time.
    update public.postings p set status = 'published', expires_at = pg_catalog.now() + pg_catalog.make_interval(days => p_days)
     where p.id = row_.id;
    outcome := 'renewed';
  else
    update public.postings p set status = 'pending', paid_days = row_.paid_days + p_days, reject_reason = null where p.id = row_.id;
    outcome := 'pending';
  end if;
  return outcome;
end;
$$;

revoke all on function public.apply_posting_payment(text, uuid, uuid, integer, integer, text, text) from public, anon, authenticated;
grant execute on function public.apply_posting_payment(text, uuid, uuid, integer, integer, text, text) to service_role;

-- Editors publish. Unexpired time is kept; otherwise the posting runs for its paid days, or for p_comp_days
-- when an editor approves without payment.
create function public.approve_posting(p_id uuid, p_comp_days integer)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  row_ public.postings;
  days integer;
  ends timestamptz;
begin
  if (select public.current_app_role()) not in ('editor', 'admin') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into row_ from public.postings p where p.id = p_id for update;
  if row_.id is null or row_.status = 'published' then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if row_.expires_at is not null and row_.expires_at > pg_catalog.now() then
    ends := row_.expires_at;
    days := 0;
  else
    days := case when row_.paid_days > 0 then row_.paid_days else coalesce(p_comp_days, 0) end;
    if days not between 1 and 365 then
      raise exception 'no paid time' using errcode = '23514';
    end if;
    ends := pg_catalog.now() + pg_catalog.make_interval(days => days);
  end if;
  update public.postings p set
    status = 'published',
    approved_at = pg_catalog.now(),
    published_at = coalesce(row_.published_at, pg_catalog.now()),
    expires_at = ends,
    paid_days = case when row_.paid_days > 0 and days > 0 then 0 else row_.paid_days end,
    reviewed_by = (select auth.uid()),
    reject_reason = null
   where p.id = row_.id;
  return ends;
end;
$$;

revoke all on function public.approve_posting(uuid, integer) from public, anon, authenticated;
grant execute on function public.approve_posting(uuid, integer) to authenticated;

-- The publish cron calls this. Public reads already hide these rows; this keeps the status honest.
create function public.expire_postings()
returns integer
language sql
volatile
security definer
set search_path = ''
as $$
  with expired as (
    update public.postings p set status = 'expired'
     where p.status = 'published'
       and (p.expires_at <= pg_catalog.now()
            or (p.closing_date is not null and p.closing_date < (pg_catalog.now() at time zone 'UTC')::date))
    returning 1
  )
  select count(*)::integer from expired;
$$;

revoke all on function public.expire_postings() from public, anon, authenticated;
grant execute on function public.expire_postings() to service_role;

-- ---------------------------------------------------------------------------
-- Public reads. Live = published, before expires_at and on or before its closing date.
-- Never the contact email, payments, reject reason or reviewer.
-- ---------------------------------------------------------------------------

create function public._postings_live()
returns table (
  id uuid, kind text, slug text, title text, organisation text, location text, country_code text,
  remote text, employment_type text, category text, salary_min integer, salary_max integer,
  salary_currency text, salary_period text, description_html text, apply_url text, apply_email text,
  closing_date date, listing_id uuid, listing_slug text, listing_name text, published_at timestamptz,
  expires_at timestamptz, updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.kind, p.slug, p.title, p.organisation, p.location, p.country_code, p.remote,
         p.employment_type, p.category, p.salary_min, p.salary_max, p.salary_currency, p.salary_period,
         p.description_html, p.apply_url, p.apply_email, p.closing_date, l.id, l.slug, l.name,
         p.published_at, p.expires_at, p.updated_at
    from public.postings p
    join public.sites s on s.id = p.site_id and s.slug = 'eyetoday'
    left join public.directory_listings l
           on l.id = p.listing_id
          and l.status = 'published'
          and exists (select 1 from public.directory_categories c where c.id = l.category_id and c.hidden = false)
   where p.status = 'published'
     and p.expires_at > pg_catalog.now()
     and (p.closing_date is null or p.closing_date >= (pg_catalog.now() at time zone 'UTC')::date);
$$;

revoke all on function public._postings_live() from public, anon, authenticated;

create function public.postings_list(p_kind text, p_type text, p_country text, p_remote text, p_page integer)
returns table (
  id uuid, slug text, title text, organisation text, location text, country_code text, remote text,
  employment_type text, category text, salary_min integer, salary_max integer, salary_currency text,
  salary_period text, closing_date date, published_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.slug, p.title, p.organisation, p.location, p.country_code, p.remote, p.employment_type,
         p.category, p.salary_min, p.salary_max, p.salary_currency, p.salary_period, p.closing_date, p.published_at
    from public._postings_live() p
   where p.kind = p_kind
     and (pg_catalog.btrim(coalesce(p_type, '')) = ''
          or (p_kind = 'job' and p.employment_type = pg_catalog.btrim(p_type))
          or (p_kind = 'classified' and p.category = pg_catalog.btrim(p_type)))
     and (pg_catalog.btrim(coalesce(p_country, '')) = '' or p.country_code = upper(pg_catalog.btrim(p_country)))
     and (pg_catalog.btrim(coalesce(p_remote, '')) = '' or p.remote = pg_catalog.btrim(p_remote))
   order by p.published_at desc, p.id
   limit 24
   offset (greatest(1, least(coalesce(p_page, 1), 100)) - 1) * 24;
$$;

create function public.postings_count(p_kind text, p_type text, p_country text, p_remote text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
    from public._postings_live() p
   where p.kind = p_kind
     and (pg_catalog.btrim(coalesce(p_type, '')) = ''
          or (p_kind = 'job' and p.employment_type = pg_catalog.btrim(p_type))
          or (p_kind = 'classified' and p.category = pg_catalog.btrim(p_type)))
     and (pg_catalog.btrim(coalesce(p_country, '')) = '' or p.country_code = upper(pg_catalog.btrim(p_country)))
     and (pg_catalog.btrim(coalesce(p_remote, '')) = '' or p.remote = pg_catalog.btrim(p_remote));
$$;

create function public.posting_by_slug(p_kind text, p_slug text)
returns table (
  id uuid, slug text, title text, organisation text, location text, country_code text, remote text,
  employment_type text, category text, salary_min integer, salary_max integer, salary_currency text,
  salary_period text, description_html text, apply_url text, apply_email text, closing_date date,
  listing_slug text, listing_name text, published_at timestamptz, expires_at timestamptz, updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.slug, p.title, p.organisation, p.location, p.country_code, p.remote, p.employment_type,
         p.category, p.salary_min, p.salary_max, p.salary_currency, p.salary_period, p.description_html,
         p.apply_url, p.apply_email, p.closing_date, p.listing_slug, p.listing_name, p.published_at,
         p.expires_at, p.updated_at
    from public._postings_live() p
   where p.kind = p_kind and p.slug = pg_catalog.btrim(coalesce(p_slug, ''))
   limit 1;
$$;

create function public.latest_jobs(lim integer)
returns table (id uuid, slug text, title text, organisation text, location text, remote text, employment_type text, published_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.slug, p.title, p.organisation, p.location, p.remote, p.employment_type, p.published_at
    from public._postings_live() p
   where p.kind = 'job'
   order by p.published_at desc, p.id
   limit greatest(1, least(coalesce(lim, 4), 8));
$$;

create function public.jobs_for_listing(p_listing uuid, lim integer)
returns table (id uuid, slug text, title text, organisation text, location text, remote text, employment_type text, published_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.slug, p.title, p.organisation, p.location, p.remote, p.employment_type, p.published_at
    from public._postings_live() p
   where p.kind = 'job' and p.listing_id = p_listing
   order by p.published_at desc, p.id
   limit greatest(1, least(coalesce(lim, 4), 8));
$$;

create function public.postings_sitemap()
returns table (kind text, slug text, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.kind, p.slug, p.updated_at from public._postings_live() p order by p.published_at desc limit 5000;
$$;

revoke all on function public.postings_list(text, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.postings_count(text, text, text, text) from public, anon, authenticated;
revoke all on function public.posting_by_slug(text, text) from public, anon, authenticated;
revoke all on function public.latest_jobs(integer) from public, anon, authenticated;
revoke all on function public.jobs_for_listing(uuid, integer) from public, anon, authenticated;
revoke all on function public.postings_sitemap() from public, anon, authenticated;

grant execute on function public.postings_list(text, text, text, text, integer) to anon, authenticated;
grant execute on function public.postings_count(text, text, text, text) to anon, authenticated;
grant execute on function public.posting_by_slug(text, text) to anon, authenticated;
grant execute on function public.latest_jobs(integer) to anon, authenticated;
grant execute on function public.jobs_for_listing(uuid, integer) to anon, authenticated;
grant execute on function public.postings_sitemap() to anon, authenticated;
