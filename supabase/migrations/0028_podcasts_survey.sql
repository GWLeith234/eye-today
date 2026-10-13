-- 0028_podcasts_survey.sql — Sprint 23: a Podcasts section, a Podcast directory category with platform links and
-- an RSS feed, a reader survey, and a single-call-to-action block for newsletter issues.
--
-- Listings gain three nullable columns and directory_listing() returns them. Survey responses are written by anon
-- through a definer function (Turnstile and the rate limit sit in the app), read by editors only.

-- ---------------------------------------------------------------------------
-- Podcasts section and directory category, for sites that exist. seed.sql repeats them for a fresh reset.
-- ---------------------------------------------------------------------------

insert into public.sections (site_id, slug, name, sort, color, icon)
select s.id, 'podcasts', 'Podcasts', 55, '#2E5E8C', 'podcast' from public.sites s
on conflict (site_id, slug) do nothing;

insert into public.directory_categories (site_id, slug, name, sort)
select s.id, 'podcast', 'Podcast', 80 from public.sites s
on conflict (site_id, slug) do nothing;

-- ---------------------------------------------------------------------------
-- Podcast fields on listings.
-- ---------------------------------------------------------------------------

alter table public.directory_listings
  add column feed_url text check (feed_url is null or (char_length(feed_url) <= 500 and feed_url ~ '^https://[^[:space:]<>"'']+$')),
  add column platform_links jsonb not null default '[]'::jsonb check (jsonb_typeof(platform_links) = 'array' and pg_catalog.jsonb_array_length(platform_links) <= 8),
  add column host_names text check (host_names is null or (char_length(host_names) <= 200 and host_names !~ '[<>]'));

-- Select on directory_listings is granted per column (0013 keeps verification_note private), so the new columns
-- must be granted too or the editor's listing page cannot read the row.
grant select (feed_url, platform_links, host_names) on table public.directory_listings to anon, authenticated;

drop function public.directory_listing(text);

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
  featured boolean,
  feed_url text,
  platform_links jsonb,
  host_names text
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
         ),
         l.feed_url, l.platform_links, l.host_names
    from public.directory_listings l
    join public.directory_categories c on c.id = l.category_id and c.hidden = false
    left join public.media m on m.id = l.logo_media_id
   where l.status = 'published'
     and l.slug = pg_catalog.btrim(directory_listing.slug)
   limit 1;
$$;

revoke all on function public.directory_listing(text) from public, anon, authenticated;
grant execute on function public.directory_listing(text) to anon, authenticated;

-- Platform links for the directory cards (the card type is a composite, so a separate read keeps it stable).
create function public.directory_platform_links(p_slugs text[])
returns table (slug text, platform_links jsonb, host_names text)
language sql
stable
security definer
set search_path = ''
as $$
  select l.slug, l.platform_links, l.host_names
    from public.directory_listings l
    join public.sites s on s.id = l.site_id and s.slug = 'eyetoday'
   where l.status = 'published' and l.slug = any (p_slugs);
$$;
revoke all on function public.directory_platform_links(text[]) from public, anon, authenticated;
grant execute on function public.directory_platform_links(text[]) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Reader survey.
-- ---------------------------------------------------------------------------

create table public.reader_surveys (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  answers jsonb not null check (jsonb_typeof(answers) = 'object'),
  email text check (email is null or (char_length(email) <= 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')),
  ip_hash text check (ip_hash is null or char_length(ip_hash) = 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index reader_surveys_site_created_idx on public.reader_surveys (site_id, created_at desc);
create trigger set_updated_at before update on public.reader_surveys for each row execute function public.set_updated_at();

alter table public.reader_surveys enable row level security;
alter table public.reader_surveys force row level security;
revoke all on table public.reader_surveys from anon, authenticated;
grant select, delete on table public.reader_surveys to authenticated;

create policy "editors read surveys" on public.reader_surveys for select to authenticated
  using ((select public.current_app_role()) in ('editor', 'admin'));
create policy "editors delete surveys" on public.reader_surveys for delete to authenticated
  using ((select public.current_app_role()) in ('editor', 'admin'));

-- One response. Answers are a flat object of short strings; the app has already run Turnstile and the rate limit.
create function public.submit_reader_survey(p_answers jsonb, p_email text, p_ip_hash text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_site uuid;
  v_id uuid;
  v_key text;
  v_val jsonb;
begin
  if p_answers is null or pg_catalog.jsonb_typeof(p_answers) <> 'object' then
    raise exception 'answers required' using errcode = '22023';
  end if;
  if (select count(*) from pg_catalog.jsonb_object_keys(p_answers)) > 12 then
    raise exception 'too many answers' using errcode = '22023';
  end if;
  for v_key, v_val in select * from pg_catalog.jsonb_each(p_answers) loop
    if pg_catalog.char_length(v_key) > 40 or pg_catalog.jsonb_typeof(v_val) <> 'string' or pg_catalog.char_length(v_val #>> '{}') > 1000 then
      raise exception 'answer too long' using errcode = '22023';
    end if;
  end loop;
  select id into v_site from public.sites where slug = 'eyetoday';
  insert into public.reader_surveys (site_id, answers, email, ip_hash)
  values (v_site, p_answers, nullif(pg_catalog.lower(pg_catalog.btrim(coalesce(p_email, ''))), ''), p_ip_hash)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.submit_reader_survey(jsonb, text, text) from public, anon, authenticated;
grant execute on function public.submit_reader_survey(jsonb, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Newsletter: one call to action, between the intro and the stories.
-- ---------------------------------------------------------------------------

alter table public.newsletter_issues
  add column cta_heading text check (cta_heading is null or (char_length(cta_heading) <= 120 and cta_heading !~ '[<>]')),
  add column cta_text text check (cta_text is null or (char_length(cta_text) <= 500 and cta_text !~ '[<>]')),
  add column cta_url text check (cta_url is null or (char_length(cta_url) <= 500 and cta_url ~ '^https://[^[:space:]<>"'']+$')),
  add column cta_button text check (cta_button is null or (char_length(cta_button) <= 40 and cta_button !~ '[<>]'));

-- Who signs the newsletter: the publisher's display name only, readable by any signed-in sender (an editor
-- cannot read other profiles under RLS, and the issue is signed by the Editor and Publisher whoever sends it).
create function public.newsletter_signoff()
returns table (display_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.display_name
    from public.profiles p
   where p.role in ('admin', 'editor') and nullif(pg_catalog.btrim(p.display_name), '') is not null
   order by case p.role when 'admin' then 0 else 1 end, p.created_at
   limit 1;
$$;
revoke all on function public.newsletter_signoff() from public, anon, authenticated;
grant execute on function public.newsletter_signoff() to authenticated;
