-- 0016_events.sql — community events calendar.
--
-- One table. Organisers (any signed-in reader) submit through submit_event and edit through
-- resubmit_event; both are definer functions and every row they write is pending. Editors and admins
-- write the table directly under RLS. Anon has no table privileges: every public read goes through the
-- definer functions at the bottom, which return published rows only (event_by_slug also returns a
-- cancelled row so its page can say so) and never return the organiser's email or editor fields.

create table public.events (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and slug <> 'submit'),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  event_type text not null
    check (event_type in ('conference', 'retreat', 'webinar', 'integration_circle', 'training', 'other')),
  attendance text not null check (attendance in ('online', 'in_person')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  tz text not null check (char_length(tz) between 1 and 64),
  venue text check (venue is null or (char_length(venue) <= 200 and venue !~ '[<>]')),
  country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  city text check (city is null or (char_length(city) <= 80 and city !~ '[<>]')),
  organiser_name text not null check (char_length(btrim(organiser_name)) between 1 and 160 and organiser_name !~ '[<>]'),
  organiser_id uuid not null references public.profiles (id) on delete cascade,
  contact_email text not null check (char_length(contact_email) <= 254),
  price_note text not null default '' check (char_length(price_note) <= 200 and price_note !~ '[<>]'),
  registration_url text check (
    registration_url is null or (char_length(registration_url) <= 500 and registration_url ~ '^https://[^[:space:]<>"]+$')
  ),
  image_media_id uuid references public.media (id) on delete set null,
  description_html text not null default '' check (char_length(description_html) <= 40000),
  listing_id uuid references public.directory_listings (id) on delete set null,
  status text not null default 'pending' check (status in ('draft', 'pending', 'rejected', 'published', 'cancelled')),
  reject_reason text check (reject_reason is null or char_length(reject_reason) <= 500),
  editor_note text check (editor_note is null or char_length(editor_note) <= 500),
  promoted_until timestamptz,
  reviewed_by uuid references public.profiles (id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, slug),
  check (ends_at > starts_at),
  check (attendance = 'online' or country_code is not null)
);
create index events_site_status_starts_idx on public.events (site_id, status, starts_at);
create index events_organiser_created_idx on public.events (organiser_id, created_at);
create index events_site_created_idx on public.events (site_id, created_at);
create index events_listing_id_idx on public.events (listing_id);
create index events_image_media_id_idx on public.events (image_media_id);
create index events_reviewed_by_idx on public.events (reviewed_by);

create trigger set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

-- Normalises every write and, for anyone who is not an editor, an admin, the table owner (migrations,
-- tests, definer functions) or the service role, forces the row back to an unreviewed pending state.
-- No organiser policy allows a direct write today; this is the second lock.
create function public.events_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.title := pg_catalog.btrim(new.title);
  new.organiser_name := pg_catalog.btrim(new.organiser_name);
  new.venue := nullif(pg_catalog.btrim(coalesce(new.venue, '')), '');
  new.city := nullif(pg_catalog.btrim(coalesce(new.city, '')), '');
  new.country_code := nullif(upper(pg_catalog.btrim(coalesce(new.country_code, ''))), '');
  new.registration_url := nullif(pg_catalog.btrim(coalesce(new.registration_url, '')), '');
  new.price_note := pg_catalog.btrim(coalesce(new.price_note, ''));
  new.tz := pg_catalog.btrim(new.tz);

  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = new.tz) then
    raise exception 'invalid event' using errcode = '23514', detail = 'unknown time zone';
  end if;
  if new.attendance = 'in_person' and new.country_code is null then
    raise exception 'invalid event' using errcode = '23514', detail = 'in-person events need a country';
  end if;

  if exists (
       select 1 from pg_catalog.pg_class c
        where c.oid = 'public.events'::pg_catalog.regclass
          and pg_catalog.pg_has_role(current_user, c.relowner, 'MEMBER')
     )
     or pg_catalog.pg_has_role(current_user, 'service_role', 'MEMBER')
     or (select public.current_app_role()) in ('editor', 'admin') then
    return new;
  end if;

  new.status := 'pending';
  new.promoted_until := null;
  new.editor_note := null;
  new.reviewed_by := null;
  new.image_media_id := null;
  new.published_at := null;
  return new;
end;
$$;

revoke all on function public.events_before_write() from public, anon, authenticated;

create trigger events_before_write
  before insert or update on public.events
  for each row execute function public.events_before_write();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.events enable row level security;
alter table public.events force row level security;
revoke all on table public.events from anon, authenticated;

-- contact_email, editor_note and reviewed_by are not granted. Editors read the note through
-- event_editor_note; the email stays in the database for the newsroom to contact the organiser.
grant select (
  id, site_id, slug, title, event_type, attendance, starts_at, ends_at, tz, venue,
  country_code, city, organiser_name, organiser_id, price_note, registration_url,
  image_media_id, description_html, listing_id, status, reject_reason, promoted_until,
  published_at, created_at, updated_at
) on table public.events to authenticated;
grant insert, update, delete on table public.events to authenticated;

create policy "organisers read their own events"
  on public.events for select to authenticated
  using (organiser_id = (select auth.uid()));

create policy "editors read events"
  on public.events for select to authenticated
  using ((select public.current_app_role()) in ('editor', 'admin'));

create policy "editors insert events"
  on public.events for insert to authenticated
  with check ((select public.current_app_role()) in ('editor', 'admin'));

create policy "editors update events"
  on public.events for update to authenticated
  using ((select public.current_app_role()) in ('editor', 'admin'))
  with check ((select public.current_app_role()) in ('editor', 'admin'));

create policy "editors delete events"
  on public.events for delete to authenticated
  using ((select public.current_app_role()) in ('editor', 'admin'));

create function public.event_editor_note(p_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select e.editor_note
    from public.events e
   where e.id = p_id
     and (select public.current_app_role()) in ('editor', 'admin');
$$;

revoke all on function public.event_editor_note(uuid) from public, anon, authenticated;
grant execute on function public.event_editor_note(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Organiser writes
-- ---------------------------------------------------------------------------

-- Plain text in, escaped HTML paragraphs out. Pages still sanitise on render.
create function public._event_description_html(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    pg_catalog.string_agg('<p>' || pg_catalog.replace(para, E'\n', '<br>') || '</p>', '' order by n),
    ''
  )
    from (
      select pg_catalog.btrim(part, E' \t\r\n') as para, n
        from pg_catalog.regexp_split_to_table(
               pg_catalog.replace(
               pg_catalog.replace(
               pg_catalog.replace(
               pg_catalog.replace(
               pg_catalog.replace(
               pg_catalog.replace(pg_catalog.left(coalesce(p_text, ''), 4000), E'\r\n', E'\n'),
                 '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;'),
               E'\n[ \t]*\n+'
             ) with ordinality as t (part, n)
    ) paras
   where para <> '';
$$;

revoke all on function public._event_description_html(text) from public, anon, authenticated;

create function public._event_check_input(
  p_title text, p_event_type text, p_attendance text, p_starts_at timestamptz, p_ends_at timestamptz,
  p_country text, p_organiser_name text, p_description text
) returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if pg_catalog.char_length(pg_catalog.btrim(coalesce(p_title, ''))) not between 1 and 160
     or coalesce(p_event_type, '') not in ('conference', 'retreat', 'webinar', 'integration_circle', 'training', 'other')
     or coalesce(p_attendance, '') not in ('online', 'in_person')
     or p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at
     or p_ends_at - p_starts_at > interval '60 days'
     or p_ends_at < pg_catalog.now()
     or p_starts_at > pg_catalog.now() + interval '3 years'
     or pg_catalog.char_length(pg_catalog.btrim(coalesce(p_organiser_name, ''))) not between 1 and 160
     or pg_catalog.char_length(coalesce(p_description, '')) > 4000
     or (p_attendance = 'in_person' and upper(pg_catalog.btrim(coalesce(p_country, ''))) !~ '^[A-Z]{2}$') then
    raise exception 'invalid event' using errcode = '23514';
  end if;
end;
$$;

revoke all on function public._event_check_input(text, text, text, timestamptz, timestamptz, text, text, text) from public, anon, authenticated;

-- A published listing on this site, or null when none was named. Raises when one was named but is not public.
create function public._event_listing(p_site uuid, p_listing_slug text)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  found uuid;
begin
  if pg_catalog.btrim(coalesce(p_listing_slug, '')) = '' then
    return null;
  end if;
  select l.id into found
    from public.directory_listings l
    join public.directory_categories c on c.id = l.category_id and c.hidden = false
   where l.site_id = p_site
     and l.slug = pg_catalog.btrim(p_listing_slug)
     and l.status = 'published';
  if found is null then
    raise exception 'invalid listing' using errcode = '23514';
  end if;
  return found;
end;
$$;

revoke all on function public._event_listing(uuid, text) from public, anon, authenticated;

create function public.submit_event(
  p_title text,
  p_event_type text,
  p_attendance text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_tz text,
  p_venue text,
  p_country text,
  p_city text,
  p_organiser_name text,
  p_price_note text,
  p_registration_url text,
  p_description text,
  p_listing_slug text
) returns text
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
  base text;
  candidate text;
  attempt integer := 0;
begin
  if me is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  perform public._event_check_input(p_title, p_event_type, p_attendance, p_starts_at, p_ends_at,
                                    p_country, p_organiser_name, p_description);

  select s.id into site from public.sites s where s.slug = 'eyetoday';
  select u.email into email from auth.users u where u.id = me;
  if site is null or email is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select count(*) into recent
    from public.events e
   where e.organiser_id = me and e.created_at > pg_catalog.now() - interval '24 hours';
  if recent >= 5 then
    raise exception 'too many submissions' using errcode = 'P0001';
  end if;
  select count(*) into recent
    from public.events e
   where e.site_id = site and e.created_at > pg_catalog.now() - interval '24 hours';
  if recent >= 100 then
    raise exception 'too many submissions' using errcode = 'P0001';
  end if;

  base := pg_catalog.btrim(
    pg_catalog.regexp_replace(pg_catalog.lower(pg_catalog.btrim(p_title)), '[^a-z0-9]+', '-', 'g'),
    '-'
  );
  base := pg_catalog.btrim(pg_catalog.left(base, 80), '-');
  if base = '' or base = 'submit' then
    base := 'event';
  end if;
  candidate := base;
  while exists (select 1 from public.events e where e.site_id = site and e.slug = candidate) loop
    attempt := attempt + 1;
    if attempt > 10 then
      raise exception 'invalid event' using errcode = '23514';
    end if;
    candidate := base || '-' || pg_catalog.left(pg_catalog.md5(pg_catalog.gen_random_uuid()::text), 6);
  end loop;

  insert into public.events (
    site_id, slug, title, event_type, attendance, starts_at, ends_at, tz, venue, country_code, city,
    organiser_name, organiser_id, contact_email, price_note, registration_url, description_html,
    listing_id, status
  ) values (
    site, candidate, pg_catalog.btrim(p_title), p_event_type, p_attendance, p_starts_at, p_ends_at, p_tz,
    nullif(pg_catalog.left(pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(p_venue, '')), '[<>]', '', 'g'), 200), ''),
    case when p_attendance = 'online' and pg_catalog.btrim(coalesce(p_country, '')) = '' then null
         else upper(pg_catalog.btrim(p_country)) end,
    nullif(pg_catalog.left(pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(p_city, '')), '[<>]', '', 'g'), 80), ''),
    pg_catalog.regexp_replace(pg_catalog.btrim(p_organiser_name), '[<>]', '', 'g'),
    me, pg_catalog.lower(email),
    pg_catalog.left(pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(p_price_note, '')), '[<>]', '', 'g'), 200),
    nullif(pg_catalog.btrim(coalesce(p_registration_url, '')), ''),
    public._event_description_html(p_description),
    public._event_listing(site, p_listing_slug),
    'pending'
  );
  return candidate;
end;
$$;

revoke all on function public.submit_event(text, text, text, timestamptz, timestamptz, text, text, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.submit_event(text, text, text, timestamptz, timestamptz, text, text, text, text, text, text, text, text, text) to authenticated;

-- The organiser's own pending or rejected row only. It goes back to pending with the reason cleared.
create function public.resubmit_event(
  p_id uuid,
  p_title text,
  p_event_type text,
  p_attendance text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_tz text,
  p_venue text,
  p_country text,
  p_city text,
  p_organiser_name text,
  p_price_note text,
  p_registration_url text,
  p_description text,
  p_listing_slug text
) returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  row_ public.events;
begin
  if me is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into row_ from public.events e
   where e.id = p_id and e.organiser_id = me and e.status in ('pending', 'rejected')
   for update;
  if row_.id is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  perform public._event_check_input(p_title, p_event_type, p_attendance, p_starts_at, p_ends_at,
                                    p_country, p_organiser_name, p_description);

  update public.events e set
    title = pg_catalog.btrim(p_title),
    event_type = p_event_type,
    attendance = p_attendance,
    starts_at = p_starts_at,
    ends_at = p_ends_at,
    tz = p_tz,
    venue = nullif(pg_catalog.left(pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(p_venue, '')), '[<>]', '', 'g'), 200), ''),
    country_code = case when p_attendance = 'online' and pg_catalog.btrim(coalesce(p_country, '')) = '' then null
                        else upper(pg_catalog.btrim(p_country)) end,
    city = nullif(pg_catalog.left(pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(p_city, '')), '[<>]', '', 'g'), 80), ''),
    organiser_name = pg_catalog.regexp_replace(pg_catalog.btrim(p_organiser_name), '[<>]', '', 'g'),
    price_note = pg_catalog.left(pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(p_price_note, '')), '[<>]', '', 'g'), 200),
    registration_url = nullif(pg_catalog.btrim(coalesce(p_registration_url, '')), ''),
    description_html = public._event_description_html(p_description),
    listing_id = public._event_listing(row_.site_id, p_listing_slug),
    status = 'pending',
    reject_reason = null
   where e.id = row_.id;
  return row_.slug;
end;
$$;

revoke all on function public.resubmit_event(uuid, text, text, text, timestamptz, timestamptz, text, text, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.resubmit_event(uuid, text, text, text, timestamptz, timestamptz, text, text, text, text, text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Public reads. Published only (event_by_slug: published or cancelled). Never the organiser's email,
-- organiser_id, editor_note, reject_reason or reviewed_by.
-- ---------------------------------------------------------------------------

create function public._events_public()
returns table (
  id uuid, slug text, title text, event_type text, attendance text, starts_at timestamptz,
  ends_at timestamptz, tz text, venue text, country_code text, city text, organiser_name text,
  price_note text, registration_url text, description_html text, image_storage_path text,
  image_alt text, listing_id uuid, listing_slug text, listing_name text, promoted boolean,
  status text, updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.slug, e.title, e.event_type, e.attendance, e.starts_at, e.ends_at, e.tz, e.venue,
         e.country_code, e.city, e.organiser_name, e.price_note, e.registration_url, e.description_html,
         m.storage_path, m.alt, l.id, l.slug, l.name,
         (e.promoted_until is not null and e.promoted_until > pg_catalog.now()),
         e.status, e.updated_at
    from public.events e
    join public.sites s on s.id = e.site_id and s.slug = 'eyetoday'
    left join public.media m on m.id = e.image_media_id
    left join public.directory_listings l
           on l.id = e.listing_id
          and l.status = 'published'
          and exists (select 1 from public.directory_categories c where c.id = l.category_id and c.hidden = false)
   where e.status in ('published', 'cancelled');
$$;

revoke all on function public._events_public() from public, anon, authenticated;

create function public.events_list(p_type text, p_country text, p_online boolean, p_when text, p_page integer)
returns table (
  id uuid, slug text, title text, event_type text, attendance text, starts_at timestamptz,
  ends_at timestamptz, tz text, venue text, country_code text, city text, organiser_name text,
  price_note text, image_storage_path text, image_alt text, promoted boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.slug, e.title, e.event_type, e.attendance, e.starts_at, e.ends_at, e.tz, e.venue,
         e.country_code, e.city, e.organiser_name, e.price_note, e.image_storage_path, e.image_alt, e.promoted
    from public._events_public() e
   where e.status = 'published'
     and case when coalesce(p_when, '') = 'past' then e.ends_at < pg_catalog.now() else e.ends_at >= pg_catalog.now() end
     and (pg_catalog.btrim(coalesce(p_type, '')) = '' or e.event_type = pg_catalog.btrim(p_type))
     and (pg_catalog.btrim(coalesce(p_country, '')) = '' or e.country_code = upper(pg_catalog.btrim(p_country)))
     and (coalesce(p_online, false) = false or e.attendance = 'online')
   order by
     case when coalesce(p_when, '') = 'past' then false else e.promoted end desc,
     case when coalesce(p_when, '') = 'past' then null else e.starts_at end asc,
     case when coalesce(p_when, '') = 'past' then e.starts_at end desc,
     e.id
   limit 24
   offset (greatest(1, least(coalesce(p_page, 1), 100)) - 1) * 24;
$$;

create function public.events_list_count(p_type text, p_country text, p_online boolean, p_when text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
    from public._events_public() e
   where e.status = 'published'
     and case when coalesce(p_when, '') = 'past' then e.ends_at < pg_catalog.now() else e.ends_at >= pg_catalog.now() end
     and (pg_catalog.btrim(coalesce(p_type, '')) = '' or e.event_type = pg_catalog.btrim(p_type))
     and (pg_catalog.btrim(coalesce(p_country, '')) = '' or e.country_code = upper(pg_catalog.btrim(p_country)))
     and (coalesce(p_online, false) = false or e.attendance = 'online');
$$;

create function public.events_in_month(p_month date)
returns table (
  id uuid, slug text, title text, event_type text, attendance text, starts_at timestamptz,
  ends_at timestamptz, tz text, city text, country_code text, promoted boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.slug, e.title, e.event_type, e.attendance, e.starts_at, e.ends_at, e.tz, e.city,
         e.country_code, e.promoted
    from public._events_public() e
   where e.status = 'published'
     and p_month is not null
     -- One day of slack each side: the page places events on their local dates, and a zone can be
     -- up to 14 hours from UTC, so an event on the 1st or the last day may sit in the next or previous UTC month.
     and e.starts_at < (pg_catalog.date_trunc('month', p_month::timestamp) + interval '1 month' + interval '1 day') at time zone 'UTC'
     and e.ends_at >= (pg_catalog.date_trunc('month', p_month::timestamp) - interval '1 day') at time zone 'UTC'
   order by e.starts_at, e.id
   limit 300;
$$;

create function public.event_by_slug(p_slug text)
returns table (
  id uuid, slug text, title text, event_type text, attendance text, starts_at timestamptz,
  ends_at timestamptz, tz text, venue text, country_code text, city text, organiser_name text,
  price_note text, registration_url text, description_html text, image_storage_path text,
  image_alt text, listing_slug text, listing_name text, promoted boolean, status text, updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.slug, e.title, e.event_type, e.attendance, e.starts_at, e.ends_at, e.tz, e.venue,
         e.country_code, e.city, e.organiser_name, e.price_note, e.registration_url, e.description_html,
         e.image_storage_path, e.image_alt, e.listing_slug, e.listing_name,
         (e.status = 'published' and e.promoted), e.status, e.updated_at
    from public._events_public() e
   where e.slug = pg_catalog.btrim(coalesce(p_slug, ''))
   limit 1;
$$;

create function public.events_for_feed()
returns table (
  id uuid, slug text, title text, attendance text, starts_at timestamptz, ends_at timestamptz,
  venue text, country_code text, city text, organiser_name text, registration_url text,
  description_html text, updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.slug, e.title, e.attendance, e.starts_at, e.ends_at, e.venue, e.country_code, e.city,
         e.organiser_name, e.registration_url, e.description_html, e.updated_at
    from public._events_public() e
   where e.status = 'published'
     and e.ends_at >= pg_catalog.now() - interval '1 day'
   order by e.starts_at, e.id
   limit 500;
$$;

create function public.upcoming_events(lim integer)
returns table (
  id uuid, slug text, title text, event_type text, attendance text, starts_at timestamptz,
  ends_at timestamptz, tz text, city text, country_code text, promoted boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.slug, e.title, e.event_type, e.attendance, e.starts_at, e.ends_at, e.tz, e.city,
         e.country_code, e.promoted
    from public._events_public() e
   where e.status = 'published' and e.ends_at >= pg_catalog.now()
   order by e.promoted desc, e.starts_at, e.id
   limit greatest(1, least(coalesce(lim, 4), 8));
$$;

create function public.events_for_listing(p_listing uuid, lim integer)
returns table (
  id uuid, slug text, title text, event_type text, attendance text, starts_at timestamptz,
  ends_at timestamptz, tz text, city text, country_code text, promoted boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.slug, e.title, e.event_type, e.attendance, e.starts_at, e.ends_at, e.tz, e.city,
         e.country_code, e.promoted
    from public._events_public() e
   where e.status = 'published'
     and e.ends_at >= pg_catalog.now()
     and e.listing_id = p_listing
   order by e.promoted desc, e.starts_at, e.id
   limit greatest(1, least(coalesce(lim, 4), 8));
$$;

create function public.events_sitemap()
returns table (slug text, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select e.slug, e.updated_at
    from public._events_public() e
   where e.status = 'published'
   order by e.starts_at desc
   limit 5000;
$$;

revoke all on function public.events_list(text, text, boolean, text, integer) from public, anon, authenticated;
revoke all on function public.events_list_count(text, text, boolean, text) from public, anon, authenticated;
revoke all on function public.events_in_month(date) from public, anon, authenticated;
revoke all on function public.event_by_slug(text) from public, anon, authenticated;
revoke all on function public.events_for_feed() from public, anon, authenticated;
revoke all on function public.upcoming_events(integer) from public, anon, authenticated;
revoke all on function public.events_for_listing(uuid, integer) from public, anon, authenticated;
revoke all on function public.events_sitemap() from public, anon, authenticated;

grant execute on function public.events_list(text, text, boolean, text, integer) to anon, authenticated;
grant execute on function public.events_list_count(text, text, boolean, text) to anon, authenticated;
grant execute on function public.events_in_month(date) to anon, authenticated;
grant execute on function public.event_by_slug(text) to anon, authenticated;
grant execute on function public.events_for_feed() to anon, authenticated;
grant execute on function public.upcoming_events(integer) to anon, authenticated;
grant execute on function public.events_for_listing(uuid, integer) to anon, authenticated;
grant execute on function public.events_sitemap() to anon, authenticated;
