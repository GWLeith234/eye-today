-- 0008_ads.sql — advertising and sponsored content.
--
-- ad_slots, ad_campaigns, ad_creatives and ad_events already exist (0001) with no client
-- grants. Anon still cannot select any of them. Readers get ads only through the definer
-- functions below, which return a creative only while it is approved, active, inside its
-- campaign window, and in the slot asked for. click_url never leaves the database except
-- through ad_click_target, which checks the same conditions.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

alter table public.ad_campaigns
  add column freq_cap_per_day integer check (freq_cap_per_day is null or freq_cap_per_day >= 1);

alter table public.ad_creatives
  add column status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  add column category text not null default 'other' check (category in ('clinic', 'research', 'advocacy', 'events', 'other')),
  add column html text;
create index ad_creatives_status_idx on public.ad_creatives (slot_id, status);

alter table public.articles
  add column sponsor_logo_media_id uuid references public.media (id) on delete set null;
create index articles_sponsor_logo_media_id_idx on public.articles (sponsor_logo_media_id);

-- ---------------------------------------------------------------------------
-- Slots every site gets
-- ---------------------------------------------------------------------------

insert into public.ad_slots (site_id, key, name, width, height)
select s.id, v.key, v.name, v.width, v.height
  from public.sites s
 cross join (values
   ('leaderboard', 'Leaderboard', 728, 90),
   ('bigbox-1', 'Big box 1', 300, 250),
   ('bigbox-2', 'Big box 2', 300, 250),
   ('in-river', 'In river', 640, 120),
   ('in-article', 'In article', 640, 250)
 ) as v (key, name, width, height)
on conflict (site_id, key) do nothing;

-- ---------------------------------------------------------------------------
-- Sponsor logos: readable when they belong to a live sponsored article. The table-level
-- SELECT grant on media to anon came with 0005; this adds one row-level path, not a general read.
-- ---------------------------------------------------------------------------

create policy "sponsor logos of live sponsored articles are publicly readable"
  on public.media
  for select
  to anon, authenticated
  using (
    exists (
      select 1
        from public.articles a
       where a.sponsor_logo_media_id = media.id
         and a.is_sponsored
         and (
           (a.status = 'published' and a.published_at is not null and a.published_at <= now())
           or (a.status = 'scheduled' and a.scheduled_for is not null and a.scheduled_for <= now())
         )
    )
  );

-- ---------------------------------------------------------------------------
-- One new table: call counts for the per-IP limit on record_ad_event. No client grants.
-- ---------------------------------------------------------------------------

create table public.ad_event_hits (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  ip_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ad_event_hits_ip_idx on public.ad_event_hits (ip_hash, created_at desc);
create index ad_event_hits_site_id_idx on public.ad_event_hits (site_id);

create trigger set_updated_at
  before update on public.ad_event_hits
  for each row execute function public.set_updated_at();
alter table public.ad_event_hits enable row level security;
alter table public.ad_event_hits force row level security;
revoke all on table public.ad_event_hits from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Editor and admin access. No anon policies. Events are written only by
-- record_ad_event and are never inserted, changed or deleted from a client.
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on table public.ad_slots, public.ad_campaigns, public.ad_creatives to authenticated;
grant select on table public.ad_events to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['ad_slots', 'ad_campaigns', 'ad_creatives'] loop
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select public.current_app_role()) in (''editor'', ''admin''))',
      'editors read ' || t, t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check ((select public.current_app_role()) in (''editor'', ''admin''))',
      'editors insert ' || t, t);
    execute format(
      'create policy %I on public.%I for update to authenticated using ((select public.current_app_role()) in (''editor'', ''admin'')) with check ((select public.current_app_role()) in (''editor'', ''admin''))',
      'editors update ' || t, t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using ((select public.current_app_role()) in (''editor'', ''admin''))',
      'editors delete ' || t, t);
  end loop;
end;
$$;

create policy "editors read ad_events"
  on public.ad_events for select to authenticated
  using ((select public.current_app_role()) in ('editor', 'admin'));

-- ---------------------------------------------------------------------------
-- What may be served right now. Internal: only the definer functions below call it.
-- ---------------------------------------------------------------------------

create function public._servable_ads()
returns table (
  creative_id uuid,
  site_id uuid,
  slot_id uuid,
  slot_key text,
  campaign_id uuid,
  media_id uuid,
  alt text,
  html text,
  click_url text,
  weight integer,
  freq_cap integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.site_id, s.id, s.key, g.id, c.media_id, c.alt, c.html, c.click_url, c.weight, g.freq_cap_per_day
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

-- The creative to show in a slot, chosen by weight. No click_url. Nothing at all unless the
-- creative is approved and active inside an active campaign's window, in that slot.
create function public.serve_ad(slot_key text)
returns table (creative_id uuid, alt text, image_path text, html text, freq_cap integer)
language sql
volatile
security definer
set search_path = ''
as $$
  select a.creative_id, a.alt, m.storage_path, a.html, a.freq_cap
    from public._servable_ads() a
    left join public.media m on m.id = a.media_id
   where a.slot_key = serve_ad.slot_key
   -- Weighted pick: the smallest -ln(u) / weight wins, so weight 3 is served three times as often as weight 1.
   order by (- pg_catalog.ln(1.0 - pg_catalog.random())) / a.weight
   limit 1;
$$;

-- Where a click goes, and the slot it came from, only while the creative is still servable.
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

-- Records an impression or click only if that creative would still be served in that slot.
-- More than 30 calls from one ip_hash in a minute do nothing (the calls are counted, not the IP).
create function public.record_ad_event(
  creative uuid,
  slot_key text,
  event_type public.ad_event_type,
  ip_hash text
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

  insert into public.ad_events (site_id, creative_id, slot_id, event_type)
  values (v_site, record_ad_event.creative, v_slot, record_ad_event.event_type);
end;
$$;

-- Daily counts for a campaign report. Runs as the caller, so only editors' RLS lets rows through.
create function public.ad_campaign_daily(campaign uuid)
returns table (day date, impressions bigint, clicks bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select (e.occurred_at at time zone 'UTC')::date,
         pg_catalog.count(*) filter (where e.event_type = 'impression'),
         pg_catalog.count(*) filter (where e.event_type = 'click')
    from public.ad_events e
    join public.ad_creatives c on c.id = e.creative_id
   where c.campaign_id = ad_campaign_daily.campaign
   group by 1
   order by 1 desc;
$$;

revoke all on function public._servable_ads() from public, anon, authenticated;
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.serve_ad(text)',
    'public.ad_click_target(uuid)',
    'public.record_ad_event(uuid, text, public.ad_event_type, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to anon, authenticated', fn);
  end loop;
end;
$$;
revoke all on function public.ad_campaign_daily(uuid) from public, anon, authenticated;
grant execute on function public.ad_campaign_daily(uuid) to authenticated;
