-- Directory listings, categories, country legal-status pages and public submissions.
-- 0012 belongs to the unmerged design sprint. This file does not depend on it.
-- 0001–0011 are already applied and are not edited here.

-- ---------------------------------------------------------------------------
-- Categories. Editors can hide one without deleting its listings.
-- ---------------------------------------------------------------------------

create table public.directory_categories (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  sort integer not null default 0,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, slug)
);
create index directory_categories_site_id_idx on public.directory_categories (site_id);

create trigger set_updated_at
  before update on public.directory_categories
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Listings. description is plain text. search is filled by the write trigger.
-- ---------------------------------------------------------------------------

create type public.directory_verification as enum ('listed', 'verified', 'medically_supervised');

create table public.directory_listings (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  category_id uuid not null references public.directory_categories (id) on delete restrict,
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (char_length(btrim(name)) between 1 and 160),
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  region text check (region is null or char_length(region) <= 80),
  city text check (city is null or char_length(city) <= 80),
  services text[] not null default '{}',
  languages text[] not null default '{}',
  website text check (website is null or char_length(website) <= 300),
  public_email text check (public_email is null or char_length(public_email) <= 254),
  public_phone text check (public_phone is null or char_length(public_phone) <= 40),
  description text not null default '' check (char_length(description) <= 2000 and description !~ '[<>]'),
  logo_media_id uuid references public.media (id) on delete set null,
  photo_media_ids uuid[] not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'pending', 'published', 'unpublished')),
  verification_level public.directory_verification not null default 'listed',
  verification_note text not null check (char_length(btrim(verification_note)) between 1 and 500),
  relationship_disclosure text check (relationship_disclosure is null or char_length(relationship_disclosure) <= 1000),
  last_reviewed_at timestamptz,
  search tsvector not null default ''::tsvector,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, slug)
);
create index directory_listings_site_id_idx on public.directory_listings (site_id);
create index directory_listings_category_id_idx on public.directory_listings (category_id);
create index directory_listings_logo_media_id_idx on public.directory_listings (logo_media_id);
create index directory_listings_published_idx on public.directory_listings (country_code, name) where status = 'published';
create index directory_listings_search_idx on public.directory_listings using gin (search);

create function public.directory_listings_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  item text;
begin
  new.country_code := upper(pg_catalog.btrim(new.country_code));
  new.name := pg_catalog.btrim(new.name);
  new.slug := pg_catalog.btrim(new.slug);
  new.description := pg_catalog.left(pg_catalog.regexp_replace(coalesce(new.description, ''), '[<>]', '', 'g'), 2000);
  new.region := nullif(pg_catalog.left(pg_catalog.btrim(coalesce(new.region, '')), 80), '');
  new.city := nullif(pg_catalog.left(pg_catalog.btrim(coalesce(new.city, '')), 80), '');
  new.website := nullif(pg_catalog.btrim(coalesce(new.website, '')), '');
  new.public_email := nullif(pg_catalog.lower(pg_catalog.btrim(coalesce(new.public_email, ''))), '');
  new.public_phone := nullif(pg_catalog.btrim(coalesce(new.public_phone, '')), '');
  new.relationship_disclosure := nullif(pg_catalog.btrim(coalesce(new.relationship_disclosure, '')), '');
  new.verification_note := pg_catalog.btrim(new.verification_note);
  if new.services is null then new.services := '{}'; end if;
  if new.languages is null then new.languages := '{}'; end if;
  if new.photo_media_ids is null then new.photo_media_ids := '{}'; end if;
  if pg_catalog.cardinality(new.services) > 20
     or pg_catalog.cardinality(new.languages) > 20
     or pg_catalog.cardinality(new.photo_media_ids) > 8 then
    raise exception 'invalid listing' using errcode = '23514';
  end if;
  foreach item in array new.services loop
    if item is null or pg_catalog.char_length(pg_catalog.btrim(item)) = 0
       or pg_catalog.char_length(item) > 40 or item ~ '[<>]' then
      raise exception 'invalid listing' using errcode = '23514';
    end if;
  end loop;
  foreach item in array new.languages loop
    if item is null or pg_catalog.char_length(pg_catalog.btrim(item)) = 0
       or pg_catalog.char_length(item) > 40 or item ~ '[<>]' then
      raise exception 'invalid listing' using errcode = '23514';
    end if;
  end loop;
  if new.website is not null and new.website !~ '^https://[^[:space:]]+$' then
    raise exception 'invalid listing' using errcode = '23514';
  end if;
  new.search :=
    pg_catalog.setweight(pg_catalog.to_tsvector('simple'::pg_catalog.regconfig, coalesce(new.name, '')), 'A')
    || pg_catalog.setweight(pg_catalog.to_tsvector('simple'::pg_catalog.regconfig, coalesce(new.description, '')), 'B')
    || pg_catalog.setweight(pg_catalog.to_tsvector('simple'::pg_catalog.regconfig, coalesce(new.city, '')), 'C')
    || pg_catalog.setweight(
         pg_catalog.to_tsvector('simple'::pg_catalog.regconfig, coalesce(pg_catalog.array_to_string(new.services, ' '), '')),
         'C'
       );
  return new;
end;
$$;

revoke all on function public.directory_listings_before_write() from public, anon, authenticated;

create trigger directory_listings_before_write
  before insert or update on public.directory_listings
  for each row execute function public.directory_listings_before_write();

create trigger set_updated_at
  before update on public.directory_listings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Legal status. Starter rows are empty drafts. Editors write the words.
-- ---------------------------------------------------------------------------

create table public.country_legal_status (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  title text not null default '' check (char_length(title) <= 160),
  summary_html text not null default '',
  sources jsonb not null default '[]'::jsonb check (jsonb_typeof(sources) = 'array'),
  as_of date,
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, country_code)
);
create index country_legal_status_site_id_idx on public.country_legal_status (site_id);

create trigger set_updated_at
  before update on public.country_legal_status
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Submissions. Anon cannot read or insert this table. The definer function
-- below is the only public write.
-- ---------------------------------------------------------------------------

create table public.listing_submissions (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  contact_email text not null check (char_length(contact_email) <= 254),
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  reviewed_by uuid references public.profiles (id) on delete set null,
  listing_id uuid references public.directory_listings (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index listing_submissions_site_id_idx on public.listing_submissions (site_id);
create index listing_submissions_status_created_idx on public.listing_submissions (status, created_at);
create index listing_submissions_email_created_idx on public.listing_submissions (lower(contact_email), created_at);
create index listing_submissions_reviewed_by_idx on public.listing_submissions (reviewed_by);
create index listing_submissions_listing_id_idx on public.listing_submissions (listing_id);

create trigger set_updated_at
  before update on public.listing_submissions
  for each row execute function public.set_updated_at();

create function public.submit_directory_listing(
  p_name text,
  p_category_slug text,
  p_country text,
  p_region text,
  p_city text,
  p_services text,
  p_languages text,
  p_website text,
  p_public_email text,
  p_public_phone text,
  p_description text,
  p_contact_email text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  site uuid;
  contact text := lower(pg_catalog.btrim(coalesce(p_contact_email, '')));
  recent integer;
begin
  if pg_catalog.char_length(pg_catalog.btrim(coalesce(p_name, ''))) not between 1 and 160
     or contact !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
     or pg_catalog.char_length(contact) > 254
     or pg_catalog.char_length(coalesce(p_description, '')) > 2000
     or upper(pg_catalog.btrim(coalesce(p_country, ''))) !~ '^[A-Z]{2}$' then
    raise exception 'invalid submission' using errcode = '23514';
  end if;

  select c.site_id into site
    from public.directory_categories c
    join public.sites s on s.id = c.site_id
   where s.slug = 'eyetoday'
     and c.slug = pg_catalog.btrim(coalesce(p_category_slug, ''))
     and c.hidden = false;
  if site is null then
    raise exception 'invalid submission' using errcode = '23514';
  end if;

  select count(*) into recent
    from public.listing_submissions s
   where lower(s.contact_email) = contact
     and s.created_at > pg_catalog.now() - interval '24 hours';
  if recent >= 3 then
    raise exception 'too many submissions' using errcode = 'P0001';
  end if;

  insert into public.listing_submissions (site_id, contact_email, status, payload)
  values (
    site,
    contact,
    'pending',
    pg_catalog.jsonb_build_object(
      'name', pg_catalog.left(pg_catalog.btrim(p_name), 160),
      'category_slug', pg_catalog.btrim(p_category_slug),
      'country_code', upper(pg_catalog.btrim(p_country)),
      'region', nullif(pg_catalog.left(pg_catalog.btrim(coalesce(p_region, '')), 80), ''),
      'city', nullif(pg_catalog.left(pg_catalog.btrim(coalesce(p_city, '')), 80), ''),
      'services', pg_catalog.left(coalesce(p_services, ''), 1000),
      'languages', pg_catalog.left(coalesce(p_languages, ''), 500),
      'website', nullif(pg_catalog.left(pg_catalog.btrim(coalesce(p_website, '')), 300), ''),
      'public_email', nullif(pg_catalog.lower(pg_catalog.left(pg_catalog.btrim(coalesce(p_public_email, '')), 254)), ''),
      'public_phone', nullif(pg_catalog.left(pg_catalog.btrim(coalesce(p_public_phone, '')), 40), ''),
      'description', pg_catalog.left(pg_catalog.regexp_replace(coalesce(p_description, ''), '[<>]', '', 'g'), 2000)
    )
  );
end;
$$;

revoke all on function public.submit_directory_listing(text, text, text, text, text, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.submit_directory_listing(text, text, text, text, text, text, text, text, text, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.directory_categories enable row level security;
alter table public.directory_categories force row level security;
alter table public.directory_listings enable row level security;
alter table public.directory_listings force row level security;
alter table public.country_legal_status enable row level security;
alter table public.country_legal_status force row level security;
alter table public.listing_submissions enable row level security;
alter table public.listing_submissions force row level security;

revoke all on table public.directory_categories from anon, authenticated;
revoke all on table public.directory_listings from anon, authenticated;
revoke all on table public.country_legal_status from anon, authenticated;
revoke all on table public.listing_submissions from anon, authenticated;

grant select on table public.directory_categories to anon, authenticated;
grant insert, update on table public.directory_categories to authenticated;

grant select on table public.directory_listings to anon, authenticated;
grant insert, update, delete on table public.directory_listings to authenticated;

grant select on table public.country_legal_status to anon, authenticated;
grant insert, update on table public.country_legal_status to authenticated;

grant select, update on table public.listing_submissions to authenticated;

create policy "public reads visible categories"
  on public.directory_categories for select to anon, authenticated
  using (hidden = false);

create policy "editors read categories"
  on public.directory_categories for select to authenticated
  using ((select public.current_app_role()) in ('editor', 'admin'));

create policy "editors insert categories"
  on public.directory_categories for insert to authenticated
  with check ((select public.current_app_role()) in ('editor', 'admin'));

create policy "editors update categories"
  on public.directory_categories for update to authenticated
  using ((select public.current_app_role()) in ('editor', 'admin'))
  with check ((select public.current_app_role()) in ('editor', 'admin'));

create policy "public reads published listings"
  on public.directory_listings for select to anon, authenticated
  using (
    status = 'published'
    and exists (
      select 1 from public.directory_categories c
       where c.id = directory_listings.category_id
         and c.hidden = false
    )
  );

create policy "editors read listings"
  on public.directory_listings for select to authenticated
  using ((select public.current_app_role()) in ('editor', 'admin'));

create policy "editors insert listings"
  on public.directory_listings for insert to authenticated
  with check ((select public.current_app_role()) in ('editor', 'admin'));

create policy "editors update listings"
  on public.directory_listings for update to authenticated
  using ((select public.current_app_role()) in ('editor', 'admin'))
  with check ((select public.current_app_role()) in ('editor', 'admin'));

create policy "editors delete listings"
  on public.directory_listings for delete to authenticated
  using ((select public.current_app_role()) in ('editor', 'admin'));

create policy "public reads published legal status"
  on public.country_legal_status for select to anon, authenticated
  using (status = 'published');

create policy "editors read legal status"
  on public.country_legal_status for select to authenticated
  using ((select public.current_app_role()) in ('editor', 'admin'));

create policy "editors insert legal status"
  on public.country_legal_status for insert to authenticated
  with check ((select public.current_app_role()) in ('editor', 'admin'));

create policy "editors update legal status"
  on public.country_legal_status for update to authenticated
  using ((select public.current_app_role()) in ('editor', 'admin'))
  with check ((select public.current_app_role()) in ('editor', 'admin'));

create policy "editors read submissions"
  on public.listing_submissions for select to authenticated
  using ((select public.current_app_role()) in ('editor', 'admin'));

create policy "editors review submissions"
  on public.listing_submissions for update to authenticated
  using ((select public.current_app_role()) in ('editor', 'admin'))
  with check ((select public.current_app_role()) in ('editor', 'admin'));

-- Logos and photos of a published listing. Hero images keep their own policy.
create policy "published listing media is publicly readable"
  on public.media for select to anon, authenticated
  using (
    exists (
      select 1
        from public.directory_listings l
        join public.directory_categories c on c.id = l.category_id and c.hidden = false
       where l.status = 'published'
         and (l.logo_media_id = media.id or media.id = any (l.photo_media_ids))
    )
  );

-- ---------------------------------------------------------------------------
-- Public reads. These never return a draft, a hidden category or a submission.
-- ---------------------------------------------------------------------------

create function public._directory_match(
  p_q text,
  p_country text,
  p_category text,
  p_service text,
  p_verification text
) returns table (id uuid, rank real)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id,
         case
           when pg_catalog.btrim(coalesce(p_q, '')) = '' then 0::real
           else pg_catalog.ts_rank(
             l.search,
             pg_catalog.plainto_tsquery('simple'::pg_catalog.regconfig, pg_catalog.left(pg_catalog.btrim(p_q), 80))
           )
         end
    from public.directory_listings l
    join public.directory_categories c on c.id = l.category_id and c.hidden = false
   where l.status = 'published'
     and (
       pg_catalog.btrim(coalesce(p_country, '')) = ''
       or l.country_code = upper(pg_catalog.btrim(p_country))
     )
     and (
       pg_catalog.btrim(coalesce(p_category, '')) = ''
       or c.slug = pg_catalog.btrim(p_category)
     )
     and (
       pg_catalog.btrim(coalesce(p_service, '')) = ''
       or exists (
         select 1 from pg_catalog.unnest(l.services) item
          where pg_catalog.lower(item) = pg_catalog.lower(pg_catalog.left(pg_catalog.btrim(p_service), 40))
       )
     )
     and (
       pg_catalog.btrim(coalesce(p_verification, '')) = ''
       or (
         pg_catalog.btrim(p_verification) in ('listed', 'verified', 'medically_supervised')
         and l.verification_level = pg_catalog.btrim(p_verification)::public.directory_verification
       )
     )
     and (
       pg_catalog.btrim(coalesce(p_q, '')) = ''
       or l.search operator(pg_catalog.@@) pg_catalog.plainto_tsquery(
         'simple'::pg_catalog.regconfig,
         pg_catalog.left(pg_catalog.btrim(p_q), 80)
       )
     );
$$;

revoke all on function public._directory_match(text, text, text, text, text) from public, anon, authenticated;

create function public.directory_search(
  q text,
  country_code text,
  category_slug text,
  service text,
  verification text,
  page integer
) returns table (
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
  has_legal boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select l.name, l.slug, c.slug, c.name, l.country_code, l.region, l.city, l.services,
         l.verification_level::text, l.description, m.storage_path, m.alt,
         exists (
           select 1 from public.country_legal_status s
            where s.site_id = l.site_id
              and s.country_code = l.country_code
              and s.status = 'published'
         )
    from public._directory_match(
           directory_search.q,
           directory_search.country_code,
           directory_search.category_slug,
           directory_search.service,
           directory_search.verification
         ) match
    join public.directory_listings l on l.id = match.id
    join public.directory_categories c on c.id = l.category_id
    left join public.media m on m.id = l.logo_media_id
   order by match.rank desc, l.name asc, l.id
   limit 24
   -- least/greatest are parser forms. Schema-qualifying them looks up
   -- pg_catalog.least(integer, integer), which does not exist.
   offset (greatest(1, least(coalesce(directory_search.page, 1), 100)) - 1) * 24;
$$;

create function public.directory_search_count(
  q text,
  country_code text,
  category_slug text,
  service text,
  verification text
) returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.count(*)::integer
    from public._directory_match(
           directory_search_count.q,
           directory_search_count.country_code,
           directory_search_count.category_slug,
           directory_search_count.service,
           directory_search_count.verification
         );
$$;

create function public.directory_listing(slug text)
returns table (
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
  has_legal boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select l.name, l.slug, c.slug, c.name, l.country_code, l.region, l.city, l.services, l.languages,
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
            where s.site_id = l.site_id
              and s.country_code = l.country_code
              and s.status = 'published'
         )
    from public.directory_listings l
    join public.directory_categories c on c.id = l.category_id and c.hidden = false
    left join public.media m on m.id = l.logo_media_id
   where l.status = 'published'
     and l.slug = pg_catalog.btrim(directory_listing.slug)
   limit 1;
$$;

create function public.directory_legal(country_code text)
returns table (
  country_code text,
  title text,
  summary_html text,
  sources jsonb,
  as_of date
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.country_code, s.title, s.summary_html, s.sources, s.as_of
    from public.country_legal_status s
    join public.sites site on site.id = s.site_id and site.slug = 'eyetoday'
   where s.status = 'published'
     and s.country_code = upper(pg_catalog.btrim(directory_legal.country_code));
$$;

create function public.directory_services()
returns table (service text)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct item
    from public.directory_listings l
    join public.directory_categories c on c.id = l.category_id and c.hidden = false
    cross join pg_catalog.unnest(l.services) item
   where l.status = 'published'
   order by 1
   limit 100;
$$;

create function public.directory_related_stories(service_slugs text[])
returns setof public.article_card
language sql
stable
security definer
set search_path = ''
as $$
  select l.title, l.dek, l.article_slug, l.section_slug, l.section_name, l.published_at,
         l.hero_storage_path, l.hero_alt, l.hero_credit, l.hero_width, l.hero_height, l.is_sponsored, l.byline
    from public._live_articles() l
    join public.article_tags at on at.article_id = l.id
    join public.tags t on t.id = at.tag_id
   where t.slug = any (coalesce(directory_related_stories.service_slugs, '{}'))
   group by l.title, l.dek, l.article_slug, l.section_slug, l.section_name, l.published_at,
            l.hero_storage_path, l.hero_alt, l.hero_credit, l.hero_width, l.hero_height, l.is_sponsored, l.byline, l.id
   order by l.published_at desc, l.id
   limit 4;
$$;

create function public.directory_sitemap()
returns table (kind text, slug text, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select 'listing'::text, l.slug, l.updated_at
    from public.directory_listings l
    join public.directory_categories c on c.id = l.category_id and c.hidden = false
   where l.status = 'published'
  union all
  select 'country'::text, lower(s.country_code), s.updated_at
    from public.country_legal_status s
   where s.status = 'published'
   limit 5000;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.directory_search(text, text, text, text, text, integer)',
    'public.directory_search_count(text, text, text, text, text)',
    'public.directory_listing(text)',
    'public.directory_legal(text)',
    'public.directory_services()',
    'public.directory_related_stories(text[])',
    'public.directory_sitemap()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to anon, authenticated', fn);
  end loop;
end;
$$;

-- Sites that already exist (production). A fresh reset creates the site later,
-- in seed.sql, which inserts the same rows.
insert into public.directory_categories (site_id, slug, name, sort)
select s.id, v.slug, v.name, v.sort
  from public.sites s
  cross join (values
    ('treatment-clinic', 'Treatment clinic / retreat', 10),
    ('medical-practitioner', 'Medical practitioner', 20),
    ('integration-coach', 'Integration coach / therapist', 30),
    ('harm-reduction', 'Harm-reduction service', 40),
    ('peer-support', 'Peer support group', 50),
    ('research-organisation', 'Research organisation', 60),
    ('advocacy-group', 'Advocacy group', 70)
  ) as v(slug, name, sort)
on conflict (site_id, slug) do nothing;

-- Empty drafts only. Do not write a legal summary here.
insert into public.country_legal_status (site_id, country_code, title, summary_html, sources, status)
select s.id, c.code, '', '', '[]'::jsonb, 'draft'
  from public.sites s
  cross join (values ('MX'), ('CR'), ('PT'), ('NL'), ('BR'), ('CA'), ('US'), ('ZA'), ('NZ'), ('GB')) as c(code)
on conflict (site_id, country_code) do nothing;
