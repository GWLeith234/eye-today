-- 0023_ad_units.sql — ad inventory on every page type, house ads, page-type targeting, sponsored listings.
--
-- 0022 added the campaign statuses this file relies on ('pending', 'rejected').
-- Sprint 8 (0010) built the engine: slots, campaigns, weighted approved creatives, frequency caps, a
-- cookie-less serve, and impression/click logging. This adds what sells: a mobile banner, house
-- campaigns that fill empty slots but never beat a paid creative, self-serve run-of-site campaigns
-- (an advertiser owns a campaign, uploads creatives, pays once for N months, an editor approves),
-- the sponsored-listing card for premium listings, page type on events, and a slot × page breakdown.
-- Run of site means random placement: no targeting, equal rotation among paid creatives.

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

alter table public.ad_campaigns
  add column is_house boolean not null default false,
  add column owner_id uuid references public.profiles (id) on delete set null,
  add column months integer check (months is null or months between 1 and 12),
  add column click_url text check (click_url is null or (char_length(click_url) <= 500 and click_url ~ '^https://[^[:space:]<>"]+$')),
  add column stripe_session_id text unique,
  add column paid_at timestamptz,
  add column amount_cents integer check (amount_cents is null or amount_cents >= 0),
  add column currency text check (currency is null or currency ~ '^[a-z]{3}$'),
  add column reject_reason text check (reject_reason is null or char_length(reject_reason) <= 500);
create index ad_campaigns_owner_idx on public.ad_campaigns (owner_id);

alter table public.ad_events add column page_type text
  check (page_type is null or page_type in ('home', 'section', 'article', 'directory', 'events', 'jobs', 'editions', 'other'));
create index ad_events_creative_page_idx on public.ad_events (creative_id, page_type);

-- ---------------------------------------------------------------------------
-- Advertisers: an owner reads their own campaigns and creatives, and edits them only before payment
-- (draft) or while pending. Editors keep full access from 0010. Events: owners read their own.
-- ---------------------------------------------------------------------------

-- Unit sizes are public information (they are on /advertise); any signed-in advertiser may read them.
create policy "signed-in users read ad slots" on public.ad_slots for select to authenticated using (true);

create policy "owners read own campaigns" on public.ad_campaigns for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "owners insert own draft campaigns" on public.ad_campaigns for insert to authenticated
  with check (owner_id = (select auth.uid()) and status = 'draft' and is_house = false and paid_at is null);
create policy "owners update own unpaid campaigns" on public.ad_campaigns for update to authenticated
  using (owner_id = (select auth.uid()) and status in ('draft', 'pending'))
  with check (owner_id = (select auth.uid()) and status in ('draft', 'pending') and is_house = false);
create policy "owners delete own draft campaigns" on public.ad_campaigns for delete to authenticated
  using (owner_id = (select auth.uid()) and status = 'draft' and paid_at is null);

create policy "owners read own creatives" on public.ad_creatives for select to authenticated
  using (exists (select 1 from public.ad_campaigns g where g.id = ad_creatives.campaign_id and g.owner_id = (select auth.uid())));
create policy "owners insert own creatives" on public.ad_creatives for insert to authenticated
  with check (
    status = 'pending' and html is null and media_id is not null
    and exists (select 1 from public.ad_campaigns g where g.id = ad_creatives.campaign_id
                 and g.owner_id = (select auth.uid()) and g.status in ('draft', 'pending'))
  );
create policy "owners delete own unapproved creatives" on public.ad_creatives for delete to authenticated
  using (
    status <> 'approved'
    and exists (select 1 from public.ad_campaigns g where g.id = ad_creatives.campaign_id
                 and g.owner_id = (select auth.uid()) and g.status in ('draft', 'pending'))
  );

create policy "owners read own ad events" on public.ad_events for select to authenticated
  using (exists (
    select 1 from public.ad_creatives c join public.ad_campaigns g on g.id = c.campaign_id
     where c.id = ad_events.creative_id and g.owner_id = (select auth.uid())
  ));

-- A creative's media must match the slot size exactly, and an advertiser may only use their own upload.
-- Definer: media rows are hidden from non-editors under RLS, and the size check needs to see them.
create function public._creative_media_fits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slot public.ad_slots;
  v_media public.media;
begin
  if new.media_id is null then return new; end if;
  select * into v_slot from public.ad_slots s where s.id = new.slot_id;
  select * into v_media from public.media m where m.id = new.media_id;
  if v_media.id is null then raise exception 'invalid creative' using errcode = '23514'; end if;
  if (select public.current_app_role()) not in ('editor', 'admin') and v_media.owner_id is distinct from (select auth.uid()) then
    raise exception 'use your own upload' using errcode = '23514';
  end if;
  if v_slot.width > 0 and (v_media.width <> v_slot.width or v_media.height <> v_slot.height) then
    raise exception 'creative size must be % x %', v_slot.width, v_slot.height using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public._creative_media_fits() from public, anon, authenticated;
create trigger ad_creatives_media_fits before insert or update of media_id, slot_id on public.ad_creatives
  for each row execute function public._creative_media_fits();

-- ---------------------------------------------------------------------------
-- Payment: one Stripe Checkout for N months. Idempotent on the session id. Sets the window from the
-- start date (or now), marks pending for editor approval. Service role only (webhook).
-- ---------------------------------------------------------------------------

create function public.apply_ad_payment(
  p_session text,
  p_campaign uuid,
  p_profile uuid,
  p_months integer,
  p_amount integer,
  p_currency text
) returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  g public.ad_campaigns;
  v_start timestamptz;
begin
  if p_session is null or p_months is null or p_months not between 1 and 12 then
    raise exception 'invalid payment' using errcode = '23514';
  end if;
  if exists (select 1 from public.ad_campaigns x where x.stripe_session_id = p_session) then
    return 'duplicate';
  end if;
  select * into g from public.ad_campaigns x where x.id = p_campaign and x.owner_id = p_profile and x.is_house = false for update;
  if g.id is null then return 'no_campaign'; end if;
  if g.paid_at is not null then return 'already_paid'; end if;
  v_start := greatest(coalesce(g.starts_at, pg_catalog.now()), pg_catalog.now());
  update public.ad_campaigns x
     set stripe_session_id = p_session, paid_at = pg_catalog.now(), months = p_months,
         amount_cents = p_amount, currency = pg_catalog.lower(p_currency),
         starts_at = v_start, ends_at = v_start + pg_catalog.make_interval(months => p_months),
         status = 'pending', reject_reason = null
   where x.id = g.id;
  return 'pending';
end;
$$;
revoke all on function public.apply_ad_payment(text, uuid, uuid, integer, integer, text) from public, anon, authenticated;
grant execute on function public.apply_ad_payment(text, uuid, uuid, integer, integer, text) to service_role;

-- Editor decision on a paid campaign. Approving also approves its pending creatives.
create function public.decide_ad_campaign(p_campaign uuid, p_approve boolean, p_reason text)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  if (select public.current_app_role()) not in ('editor', 'admin') then
    raise exception 'editors only' using errcode = '42501';
  end if;
  if p_approve then
    update public.ad_campaigns g set status = 'active', reject_reason = null where g.id = p_campaign and g.status = 'pending';
    update public.ad_creatives c set status = 'approved' where c.campaign_id = p_campaign and c.status = 'pending';
  else
    update public.ad_campaigns g set status = 'rejected', reject_reason = pg_catalog.left(coalesce(p_reason, ''), 500)
     where g.id = p_campaign and g.status = 'pending';
  end if;
end;
$$;
revoke all on function public.decide_ad_campaign(uuid, boolean, text) from public, anon;
grant execute on function public.decide_ad_campaign(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Serving: paid creatives rotate equally (run of site, random placement); house only when none fits.
-- ---------------------------------------------------------------------------

drop function public.serve_ad(text);
drop function public.ad_click_target(uuid);
drop function public.record_ad_event(uuid, text, public.ad_event_type, text);
drop function public._servable_ads();

create function public._servable_ads()
returns table (
  creative_id uuid, site_id uuid, slot_id uuid, slot_key text, campaign_id uuid, media_id uuid,
  alt text, html text, click_url text, weight integer, freq_cap integer, is_house boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.site_id, s.id, s.key, g.id, c.media_id, c.alt, c.html, c.click_url, c.weight,
         g.freq_cap_per_day, g.is_house
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

-- The creative for a slot. Paid creatives rotate by weight (equal by default); a house creative is
-- picked only when no paid one is servable for the slot.
create function public.serve_ad(slot_key text, page_type text)
returns table (creative_id uuid, alt text, image_path text, html text, freq_cap integer, is_house boolean)
language sql
volatile
security definer
set search_path = ''
as $$
  -- page_type is accepted for symmetry with record_ad_event and ignored: placement is random.
  select a.creative_id, a.alt, m.storage_path, a.html, a.freq_cap, a.is_house
    from public._servable_ads() a
    left join public.media m on m.id = a.media_id
   where a.slot_key = serve_ad.slot_key
   order by a.is_house asc, (- pg_catalog.ln(1.0 - pg_catalog.random())) / a.weight
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
-- House campaign: seeded for sites that exist now. On a fresh local reset the site is created by
-- seed.sql after the migrations, which seeds the same house ads (see supabase/seed.sql).
-- ---------------------------------------------------------------------------

with site as (select id from public.sites where slug = 'eyetoday'),
camp as (
  insert into public.ad_campaigns (site_id, advertiser_name, name, status, is_house)
  select site.id, 'Eye Today', 'House ads', 'active', true from site
  returning id, site_id
),
slot as (select id, key from public.ad_slots where site_id = (select id from site))
insert into public.ad_creatives (site_id, campaign_id, slot_id, click_url, alt, html, status, weight)
select camp.site_id, camp.id, slot.id, v.click_url, v.alt, v.html, 'approved', 1
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
