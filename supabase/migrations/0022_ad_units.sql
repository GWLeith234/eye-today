-- 0022_ad_units.sql — ad inventory on every page type, house ads, page-type targeting, sponsored listings.
--
-- Sprint 8 (0010) built the engine: slots, campaigns, weighted approved creatives, frequency caps, a
-- cookie-less serve, and impression/click logging. This adds what sells: two more units (a mobile
-- banner and a per-listing sponsored card), page-type targeting on creatives and events, house
-- campaigns that fill empty slots but never beat a paid creative, and a slot × page breakdown.

-- ---------------------------------------------------------------------------
-- Slots
-- ---------------------------------------------------------------------------

insert into public.ad_slots (site_id, key, name, width, height)
select s.id, v.key, v.name, v.width, v.height
  from public.sites s
 cross join (values
   ('mobile-banner', 'Mobile banner', 320, 50)
 ) as v(key, name, width, height)
on conflict (site_id, key) do nothing;

-- ---------------------------------------------------------------------------
-- Campaign and creative columns
-- ---------------------------------------------------------------------------

alter table public.ad_campaigns add column is_house boolean not null default false;

alter table public.ad_creatives
  add column page_types text[] not null default '{}'
    check (page_types <@ array['home', 'section', 'article', 'directory', 'events', 'jobs', 'editions', 'other']::text[]);

alter table public.ad_events add column page_type text
  check (page_type is null or page_type in ('home', 'section', 'article', 'directory', 'events', 'jobs', 'editions', 'other'));
create index ad_events_creative_page_idx on public.ad_events (creative_id, page_type);

-- ---------------------------------------------------------------------------
-- Serving: paid first, house only when nothing paid fits; page-type filter; sponsored listing card data.
-- ---------------------------------------------------------------------------

drop function public.serve_ad(text);
drop function public.ad_click_target(uuid);
drop function public.record_ad_event(uuid, text, public.ad_event_type, text);
drop function public._servable_ads();

create function public._servable_ads()
returns table (
  creative_id uuid, site_id uuid, slot_id uuid, slot_key text, campaign_id uuid, media_id uuid,
  alt text, html text, click_url text, weight integer, freq_cap integer, is_house boolean,
  page_types text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.site_id, s.id, s.key, g.id, c.media_id, c.alt, c.html, c.click_url, c.weight,
         g.freq_cap_per_day, g.is_house, c.page_types
    from public.ad_creatives c
    join public.ad_slots s on s.id = c.slot_id
    join public.ad_campaigns g on g.id = c.campaign_id
   where c.status = 'approved'
     and c.is_active
     and s.is_active
     and g.status = 'active'
     and (g.starts_at is null or g.starts_at <= pg_catalog.now())
     and (g.ends_at is null or g.ends_at > pg_catalog.now())
     and (c.media_id is not null or c.html is not null);
$$;
revoke all on function public._servable_ads() from public, anon, authenticated;

-- The creative for a slot on a page type. Paid creatives are picked by weight; a house creative is
-- picked only when no paid one fits.
create function public.serve_ad(slot_key text, page_type text)
returns table (creative_id uuid, alt text, image_path text, html text, freq_cap integer, is_house boolean)
language sql
volatile
security definer
set search_path = ''
as $$
  with fit as (
    select a.*
      from public._servable_ads() a
     where a.slot_key = serve_ad.slot_key
       and (pg_catalog.cardinality(a.page_types) = 0 or serve_ad.page_type = any (a.page_types))
  )
  select f.creative_id, f.alt, m.storage_path, f.html, f.freq_cap, f.is_house
    from fit f
    left join public.media m on m.id = f.media_id
   order by f.is_house asc, (- pg_catalog.ln(1.0 - pg_catalog.random())) / f.weight
   limit 1;
$$;

-- The sponsored listing: a premium (featured) listing, rotated at random among those active and
-- unexpired, returned as a directory card so the page renders the real listing with a label. The
-- premium tier is sold through listing_features (Stripe, $240/yr); no creative is involved.
create function public.serve_sponsored_listing()
returns setof public.directory_card
language sql
volatile
security definer
set search_path = ''
as $$
  select l.name, l.slug, c.slug, c.name, l.country_code, l.region, l.city, l.services,
         l.verification_level::text, l.description, md.storage_path, md.alt,
         exists (
           select 1 from public.country_legal_status s
            where s.site_id = l.site_id and s.country_code = l.country_code and s.status = 'published'
         ),
         l.lat, l.lng, l.relationship_disclosure, true,
         p.storage_path, p.alt
    from public.directory_listings l
    join public.directory_categories c on c.id = l.category_id and c.hidden = false
    left join public.media md on md.id = l.logo_media_id
    left join lateral public._listing_first_photo(l) p on true
   where l.status = 'published'
     and exists (
       select 1 from public.listing_features f
        where f.listing_id = l.id and f.site_id = l.site_id
          and f.status = 'active' and f.current_period_end > pg_catalog.now()
     )
   order by pg_catalog.random()
   limit 1;
$$;

create function public.ad_click_target(creative uuid)
returns table (click_url text, slot_key text)
language sql
stable
security definer
set search_path = ''
as $$
  select a.click_url, a.slot_key
    from public._servable_ads() a
   where a.creative_id = ad_click_target.creative
   limit 1;
$$;

create function public.record_ad_event(
  creative uuid,
  slot_key text,
  event_type public.ad_event_type,
  ip_hash text,
  page_type text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_site uuid;
  v_slot uuid;
  v_calls integer;
begin
  if record_ad_event.ip_hash is null or record_ad_event.ip_hash !~ '^[0-9a-f]{64}$'
     or record_ad_event.creative is null or record_ad_event.slot_key is null or record_ad_event.event_type is null then
    return;
  end if;
  if record_ad_event.page_type is not null
     and record_ad_event.page_type not in ('home', 'section', 'article', 'directory', 'events', 'jobs', 'editions', 'other') then
    return;
  end if;

  select a.site_id, a.slot_id into v_site, v_slot
    from public._servable_ads() a
   where a.creative_id = record_ad_event.creative
     and a.slot_key = record_ad_event.slot_key;
  if v_site is null then
    return;
  end if;

  if pg_catalog.random() < 0.02 then
    delete from public.ad_event_hits h where h.created_at < pg_catalog.now() - interval '1 hour';
  end if;
  insert into public.ad_event_hits (site_id, ip_hash) values (v_site, record_ad_event.ip_hash);
  select pg_catalog.count(*) into v_calls
    from public.ad_event_hits h
   where h.ip_hash = record_ad_event.ip_hash
     and h.created_at > pg_catalog.now() - interval '1 minute';
  if v_calls > 30 then
    return;
  end if;

  insert into public.ad_events (site_id, creative_id, slot_id, event_type, page_type)
  values (v_site, record_ad_event.creative, v_slot, record_ad_event.event_type, record_ad_event.page_type);
end;
$$;

-- Slot × page type for a campaign report. Runs as the caller: editors only, under RLS.
create function public.ad_campaign_breakdown(campaign uuid)
returns table (slot_key text, page_type text, impressions bigint, clicks bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select s.key, coalesce(e.page_type, 'unknown'),
         pg_catalog.count(*) filter (where e.event_type = 'impression'),
         pg_catalog.count(*) filter (where e.event_type = 'click')
    from public.ad_events e
    join public.ad_creatives c on c.id = e.creative_id
    join public.ad_slots s on s.id = e.slot_id
   where c.campaign_id = ad_campaign_breakdown.campaign
   group by 1, 2
   order by 3 desc, 1, 2;
$$;

revoke all on function public.serve_ad(text, text), public.serve_sponsored_listing(), public.ad_click_target(uuid),
  public.record_ad_event(uuid, text, public.ad_event_type, text, text), public.ad_campaign_breakdown(uuid)
  from public, anon, authenticated;
grant execute on function public.serve_ad(text, text), public.serve_sponsored_listing(), public.ad_click_target(uuid),
  public.record_ad_event(uuid, text, public.ad_event_type, text, text) to anon, authenticated;
grant execute on function public.ad_campaign_breakdown(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- House campaign: on-brand fallbacks so the inventory is visible before it is sold.
-- ---------------------------------------------------------------------------

with site as (select id from public.sites where slug = 'eyetoday'),
camp as (
  insert into public.ad_campaigns (site_id, advertiser_name, name, status, is_house, category)
  select site.id, 'Eye Today', 'House ads', 'active', true, 'other' from site
  returning id, site_id
),
slot as (select id, key from public.ad_slots where site_id = (select id from site))
insert into public.ad_creatives (site_id, campaign_id, slot_id, click_url, alt, html, status, weight, page_types)
select camp.site_id, camp.id, slot.id, v.click_url, v.alt, v.html, 'approved', 1, '{}'
  from camp
  cross join (values
    ('leaderboard', 'https://theeye.today/editions', 'Read the monthly edition',
     '<p><strong>The monthly edition.</strong> Every month, the stories that mattered, in one issue you can read online or download. <a href="https://theeye.today/editions">Read the first issue</a></p>'),
    ('mobile-banner', 'https://theeye.today/newsletter', 'Get the newsletter',
     '<p><strong>Eye Today in your inbox.</strong> <a href="https://theeye.today/newsletter">Subscribe</a></p>'),
    ('bigbox-1', 'https://theeye.today/directory/submit', 'List your clinic in the directory',
     '<p><strong>List your clinic.</strong> Verified listings in the only independent directory of ibogaine and addiction-treatment providers. <a href="https://theeye.today/directory/submit">Submit a listing</a></p>'),
    ('bigbox-2', 'https://theeye.today/support', 'Support independent reporting',
     '<p><strong>Independent reporting costs money.</strong> Supporters keep Eye Today free to read and free of provider influence. <a href="https://theeye.today/support">Become a supporter</a></p>'),
    ('in-river', 'https://theeye.today/advertise', 'Advertise with Eye Today',
     '<p><strong>Reach the people who make treatment decisions.</strong> Clinics, researchers, conferences and advocates read Eye Today. <a href="https://theeye.today/advertise">Advertise with us</a></p>'),
    ('in-article', 'https://theeye.today/newsletter', 'Get the newsletter',
     '<p><strong>Don''t miss the next story.</strong> News, research and policy on ibogaine and addiction treatment, in your inbox. <a href="https://theeye.today/newsletter">Subscribe to the newsletter</a></p>')
  ) as v(slot_key, click_url, alt, html)
  join slot on slot.key = v.slot_key;
