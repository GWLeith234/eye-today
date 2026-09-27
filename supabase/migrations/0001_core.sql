-- 0001_core.sql — Eye Today MVP data model.
--
-- Every table has RLS enabled and forced. The only public read paths are
-- sections and published articles; all writes go through service_role,
-- which bypasses RLS. Later sprints add policies as features need them.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.app_role as enum ('reader', 'supporter', 'contributor', 'editor', 'admin');
create type public.article_status as enum ('draft', 'submitted', 'in_review', 'scheduled', 'published', 'archived');
create type public.subscriber_status as enum ('pending', 'active', 'unsubscribed', 'bounced');
create type public.newsletter_issue_status as enum ('draft', 'scheduled', 'sent');
create type public.ad_campaign_status as enum ('draft', 'active', 'paused', 'ended');
create type public.ad_event_type as enum ('impression', 'click');
create type public.membership_interval as enum ('month', 'year');
create type public.membership_status as enum ('active', 'past_due', 'canceled', 'expired');

-- ---------------------------------------------------------------------------
-- Trigger functions
-- ---------------------------------------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

create function public.articles_set_search()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.search :=
    pg_catalog.setweight(pg_catalog.to_tsvector('pg_catalog.english'::pg_catalog.regconfig, coalesce(new.title, '')), 'A')
    || pg_catalog.setweight(pg_catalog.to_tsvector('pg_catalog.english'::pg_catalog.regconfig, coalesce(new.dek, '')), 'B')
    || pg_catalog.setweight(
         pg_catalog.to_tsvector(
           'pg_catalog.english'::pg_catalog.regconfig,
           pg_catalog.regexp_replace(coalesce(new.body_html, ''), '<[^>]*>', ' ', 'g')
         ),
         'C'
       );
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.articles_set_search() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Sites
-- ---------------------------------------------------------------------------

create table public.sites (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  site_id uuid not null references public.sites (id) on delete cascade,
  display_name text,
  bio text,
  avatar_url text,
  role public.app_role not null default 'reader',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_site_id_idx on public.profiles (site_id);

create table public.disclosures (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index disclosures_site_id_idx on public.disclosures (site_id);
create index disclosures_profile_id_idx on public.disclosures (profile_id);

-- ---------------------------------------------------------------------------
-- Taxonomy and media
-- ---------------------------------------------------------------------------

create table public.sections (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  parent_id uuid references public.sections (id) on delete set null,
  slug text not null,
  name text not null,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, slug)
);
create index sections_parent_id_idx on public.sections (parent_id);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  slug text not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, slug)
);

create table public.media (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  storage_path text not null,
  alt text,
  credit text,
  caption text,
  width integer check (width > 0),
  height integer check (height > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, storage_path)
);

-- ---------------------------------------------------------------------------
-- Articles
-- ---------------------------------------------------------------------------

create table public.articles (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  section_id uuid not null references public.sections (id) on delete restrict,
  slug text not null,
  title text not null,
  dek text,
  body_json jsonb,
  body_html text,
  hero_media_id uuid references public.media (id) on delete set null,
  status public.article_status not null default 'draft',
  is_sponsored boolean not null default false,
  sponsor_name text,
  published_at timestamptz,
  scheduled_for timestamptz,
  seo_title text,
  seo_description text,
  search tsvector,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, slug),
  constraint articles_published_has_date check (status <> 'published' or published_at is not null),
  constraint articles_scheduled_has_date check (status <> 'scheduled' or scheduled_for is not null),
  constraint articles_sponsored_has_sponsor check (not is_sponsored or sponsor_name is not null)
);
create index articles_site_status_published_idx on public.articles (site_id, status, published_at desc);
create index articles_section_id_idx on public.articles (section_id);
create index articles_hero_media_id_idx on public.articles (hero_media_id);
create index articles_search_idx on public.articles using gin (search);

create trigger articles_set_search
  before insert or update of title, dek, body_html on public.articles
  for each row execute function public.articles_set_search();

create table public.article_authors (
  article_id uuid not null references public.articles (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  site_id uuid not null references public.sites (id) on delete cascade,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (article_id, profile_id)
);
create index article_authors_profile_id_idx on public.article_authors (profile_id);
create index article_authors_site_id_idx on public.article_authors (site_id);

create table public.article_tags (
  article_id uuid not null references public.articles (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  site_id uuid not null references public.sites (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (article_id, tag_id)
);
create index article_tags_tag_id_idx on public.article_tags (tag_id);
create index article_tags_site_id_idx on public.article_tags (site_id);

create table public.article_revisions (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  article_id uuid not null references public.articles (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  body_json jsonb,
  body_html text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index article_revisions_article_created_idx on public.article_revisions (article_id, created_at desc);
create index article_revisions_site_id_idx on public.article_revisions (site_id);
create index article_revisions_author_id_idx on public.article_revisions (author_id);

-- ---------------------------------------------------------------------------
-- Newsletter
-- ---------------------------------------------------------------------------

create table public.newsletter_lists (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  slug text not null,
  name text not null,
  description text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, slug)
);

create table public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  list_id uuid not null references public.newsletter_lists (id) on delete cascade,
  profile_id uuid references public.profiles (id) on delete set null,
  email text not null check (email = lower(email) and position('@' in email) > 1),
  status public.subscriber_status not null default 'pending',
  confirmed_at timestamptz,
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (list_id, email)
);
create index newsletter_subscribers_site_id_idx on public.newsletter_subscribers (site_id);
create index newsletter_subscribers_profile_id_idx on public.newsletter_subscribers (profile_id);

create table public.newsletter_issues (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  list_id uuid not null references public.newsletter_lists (id) on delete restrict,
  subject text not null,
  preheader text,
  body_html text,
  status public.newsletter_issue_status not null default 'draft',
  scheduled_for timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index newsletter_issues_site_id_idx on public.newsletter_issues (site_id);
create index newsletter_issues_list_status_idx on public.newsletter_issues (list_id, status);

-- ---------------------------------------------------------------------------
-- Ads
-- ---------------------------------------------------------------------------

create table public.ad_slots (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  key text not null,
  name text not null,
  width integer check (width > 0),
  height integer check (height > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, key)
);

create table public.ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  advertiser_name text not null,
  name text not null,
  status public.ad_campaign_status not null default 'draft',
  starts_at timestamptz,
  ends_at timestamptz,
  budget_cents integer check (budget_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ad_campaigns_dates check (ends_at is null or starts_at is null or ends_at > starts_at)
);
create index ad_campaigns_site_status_idx on public.ad_campaigns (site_id, status);

create table public.ad_creatives (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  campaign_id uuid not null references public.ad_campaigns (id) on delete cascade,
  slot_id uuid not null references public.ad_slots (id) on delete restrict,
  media_id uuid references public.media (id) on delete set null,
  click_url text not null,
  alt text,
  weight integer not null default 1 check (weight > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ad_creatives_site_id_idx on public.ad_creatives (site_id);
create index ad_creatives_campaign_id_idx on public.ad_creatives (campaign_id);
create index ad_creatives_slot_id_idx on public.ad_creatives (slot_id);
create index ad_creatives_media_id_idx on public.ad_creatives (media_id);

create table public.ad_events (
  id bigint generated always as identity primary key,
  site_id uuid not null references public.sites (id) on delete cascade,
  creative_id uuid not null references public.ad_creatives (id) on delete cascade,
  slot_id uuid not null references public.ad_slots (id) on delete cascade,
  event_type public.ad_event_type not null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ad_events_creative_occurred_idx on public.ad_events (creative_id, occurred_at desc);
create index ad_events_site_occurred_idx on public.ad_events (site_id, occurred_at desc);
create index ad_events_slot_id_idx on public.ad_events (slot_id);

-- ---------------------------------------------------------------------------
-- Memberships
-- ---------------------------------------------------------------------------

create table public.membership_tiers (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  slug text not null,
  name text not null,
  description text,
  price_cents integer not null default 0 check (price_cents >= 0),
  interval public.membership_interval not null default 'month',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, slug)
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  tier_id uuid not null references public.membership_tiers (id) on delete restrict,
  status public.membership_status not null default 'active',
  current_period_end timestamptz,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, profile_id)
);
create index memberships_profile_id_idx on public.memberships (profile_id);
create index memberships_tier_id_idx on public.memberships (tier_id);

-- ---------------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------------

create table public.audit_log (
  id bigint generated always as identity primary key,
  site_id uuid not null references public.sites (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index audit_log_site_created_idx on public.audit_log (site_id, created_at desc);
create index audit_log_entity_idx on public.audit_log (entity_type, entity_id);
create index audit_log_actor_id_idx on public.audit_log (actor_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers, RLS and grants for every table
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'sites', 'profiles', 'disclosures', 'sections', 'tags', 'media',
    'articles', 'article_authors', 'article_tags', 'article_revisions',
    'newsletter_lists', 'newsletter_subscribers', 'newsletter_issues',
    'ad_slots', 'ad_campaigns', 'ad_creatives', 'ad_events',
    'membership_tiers', 'memberships', 'audit_log'
  ]
  loop
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

revoke all on all sequences in schema public from anon, authenticated;

-- Public read paths. No insert/update/delete policies: service_role is the only writer.
grant select on table public.sections to anon, authenticated;
grant select on table public.articles to anon, authenticated;

create policy "sections are publicly readable"
  on public.sections
  for select
  to anon, authenticated
  using (true);

create policy "published articles are publicly readable"
  on public.articles
  for select
  to anon, authenticated
  using (
    status = 'published'
    and published_at is not null
    and published_at <= now()
  );
