-- 0005_frontend.sql — public front end.
--
-- Author slugs, editor-curated homepage slots, privacy-preserving view counts,
-- public hero metadata, and SECURITY DEFINER read functions for the public
-- site. Every public function goes through _live_articles(), so none of them
-- can return a draft, an email, a role, or an unpublished hero.

-- ---------------------------------------------------------------------------
-- profiles.slug: set once, never rewritten when display_name changes.
-- ---------------------------------------------------------------------------

alter table public.profiles add column slug text;

create function public.profile_slug_base(name text)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select coalesce(
    nullif(pg_catalog.btrim(pg_catalog.regexp_replace(pg_catalog.lower(coalesce(name, '')), '[^a-z0-9]+', '-', 'g'), '-'), ''),
    'author'
  );
$$;

create function public.profile_unique_slug(name text, profile uuid, site uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  base text := public.profile_slug_base(name);
  candidate text;
begin
  foreach candidate in array array[
    base,
    base || '-' || pg_catalog.left(profile::text, 8),
    base || '-' || pg_catalog.replace(profile::text, '-', '')
  ] loop
    if not exists (
      select 1 from public.profiles p
       where p.site_id = site and p.slug = candidate and p.id <> profile
    ) then
      return candidate;
    end if;
  end loop;
  return candidate;
end;
$$;

revoke all on function public.profile_slug_base(text) from public, anon, authenticated;
revoke all on function public.profile_unique_slug(text, uuid, uuid) from public, anon, authenticated;

-- Backfill in creation order, so the earliest profile keeps the plain slug.
do $$
declare
  r record;
begin
  for r in select p.id, p.site_id, p.display_name from public.profiles p order by p.created_at, p.id loop
    update public.profiles
       set slug = public.profile_unique_slug(r.display_name, r.id, r.site_id)
     where id = r.id;
  end loop;
end;
$$;

alter table public.profiles add constraint profiles_site_slug_key unique (site_id, slug);

create function public.profiles_fill_slug()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.slug is null then
    new.slug := public.profile_unique_slug(new.display_name, new.id, new.site_id);
  end if;
  return new;
end;
$$;

revoke all on function public.profiles_fill_slug() from public, anon, authenticated;

create trigger profiles_fill_slug
  before insert on public.profiles
  for each row execute function public.profiles_fill_slug();

-- ---------------------------------------------------------------------------
-- homepage_slots: editor-curated lead + secondary positions.
-- ---------------------------------------------------------------------------

create table public.homepage_slots (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  slot text not null check (slot in ('lead', 'secondary')),
  position integer not null check (position between 0 and 3),
  article_id uuid not null references public.articles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, slot, position),
  constraint homepage_slots_lead_position check (slot <> 'lead' or position = 0)
);
create index homepage_slots_article_id_idx on public.homepage_slots (article_id);

create trigger set_updated_at
  before update on public.homepage_slots
  for each row execute function public.set_updated_at();

alter table public.homepage_slots enable row level security;
alter table public.homepage_slots force row level security;
revoke all on table public.homepage_slots from anon, authenticated;
grant select, insert, update, delete on table public.homepage_slots to authenticated;

create policy "editors read homepage slots"
  on public.homepage_slots for select to authenticated
  using ((select public.current_app_role()) in ('editor', 'admin'));
create policy "editors insert homepage slots"
  on public.homepage_slots for insert to authenticated
  with check ((select public.current_app_role()) in ('editor', 'admin'));
create policy "editors update homepage slots"
  on public.homepage_slots for update to authenticated
  using ((select public.current_app_role()) in ('editor', 'admin'))
  with check ((select public.current_app_role()) in ('editor', 'admin'));
create policy "editors delete homepage slots"
  on public.homepage_slots for delete to authenticated
  using ((select public.current_app_role()) in ('editor', 'admin'));

-- ---------------------------------------------------------------------------
-- View counts. No client grants: only record_article_view and most_read touch
-- these. article_view_seen stores a salted hash, never an IP.
-- ---------------------------------------------------------------------------

create table public.article_view_days (
  site_id uuid not null references public.sites (id) on delete cascade,
  article_id uuid not null references public.articles (id) on delete cascade,
  day date not null,
  views integer not null default 0 check (views >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (article_id, day)
);
create index article_view_days_day_idx on public.article_view_days (day);
create index article_view_days_site_id_idx on public.article_view_days (site_id);

create trigger set_updated_at
  before update on public.article_view_days
  for each row execute function public.set_updated_at();

create table public.article_view_seen (
  site_id uuid not null references public.sites (id) on delete cascade,
  article_id uuid not null references public.articles (id) on delete cascade,
  day date not null,
  ip_hash text not null check (char_length(ip_hash) <= 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (article_id, day, ip_hash)
);
create index article_view_seen_site_id_idx on public.article_view_seen (site_id);

alter table public.article_view_days enable row level security;
alter table public.article_view_days force row level security;
alter table public.article_view_seen enable row level security;
alter table public.article_view_seen force row level security;
revoke all on table public.article_view_days from anon, authenticated;
revoke all on table public.article_view_seen from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Public hero metadata: only media rows that are the hero of a live article.
-- ---------------------------------------------------------------------------

grant select on table public.media to anon, authenticated;

create policy "live heroes are publicly readable"
  on public.media
  for select
  to anon, authenticated
  using (
    exists (
      select 1
        from public.articles a
       where a.hero_media_id = media.id
         and (
           (a.status = 'published' and a.published_at is not null and a.published_at <= now())
           or (a.status = 'scheduled' and a.scheduled_for is not null and a.scheduled_for <= now())
         )
    )
  );

-- ---------------------------------------------------------------------------
-- Live articles, as cards. Internal: not executable by anon or authenticated.
-- ---------------------------------------------------------------------------

create type public.article_card as (
  title text,
  dek text,
  article_slug text,
  section_slug text,
  section_name text,
  published_at timestamptz,
  hero_storage_path text,
  hero_alt text,
  hero_credit text,
  hero_width integer,
  hero_height integer,
  is_sponsored boolean,
  byline text
);

create function public._live_articles()
returns table (
  id uuid,
  title text,
  dek text,
  article_slug text,
  section_slug text,
  section_name text,
  published_at timestamptz,
  hero_storage_path text,
  hero_alt text,
  hero_credit text,
  hero_width integer,
  hero_height integer,
  is_sponsored boolean,
  byline text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    a.id,
    a.title,
    a.dek,
    a.slug,
    s.slug,
    s.name,
    case when a.status = 'published' then a.published_at else a.scheduled_for end,
    m.storage_path,
    m.alt,
    m.credit,
    m.width,
    m.height,
    a.is_sponsored,
    (
      select p.display_name
        from public.article_authors aa
        join public.profiles p on p.id = aa.profile_id
       where aa.article_id = a.id
       order by aa.sort, aa.created_at
       limit 1
    )
  from public.articles a
  join public.sections s on s.id = a.section_id
  left join public.media m on m.id = a.hero_media_id
  where (a.status = 'published' and a.published_at is not null and a.published_at <= pg_catalog.now())
     or (a.status = 'scheduled' and a.scheduled_for is not null and a.scheduled_for <= pg_catalog.now());
$$;

revoke all on function public._live_articles() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Public read functions.
-- ---------------------------------------------------------------------------

create function public.homepage_public()
returns table (
  slot text,
  slot_position integer,
  title text,
  dek text,
  article_slug text,
  section_slug text,
  section_name text,
  published_at timestamptz,
  hero_storage_path text,
  hero_alt text,
  hero_credit text,
  hero_width integer,
  hero_height integer,
  is_sponsored boolean,
  byline text
)
language sql
stable
security definer
set search_path = ''
as $$
  with live as (
    select * from public._live_articles()
  ),
  wanted as (
    select 'lead'::text as slot, 0 as pos, 0 as rank
    union all
    select 'secondary'::text, g, g + 1 from pg_catalog.generate_series(0, 3) as g
  ),
  -- Curated picks, but only if the article is live; a draft in a slot is ignored.
  chosen as (
    select w.slot, w.pos, w.rank, l.id
      from wanted w
      left join public.homepage_slots hs on hs.slot = w.slot and hs.position = w.pos
      left join live l on l.id = hs.article_id
  ),
  deduped as (
    select c.slot, c.pos, c.rank,
           case when c.id is not null and pg_catalog.row_number() over (partition by c.id order by c.rank) = 1
                then c.id end as id
      from chosen c
  ),
  empties as (
    select d.slot, d.pos, d.rank, pg_catalog.row_number() over (order by d.rank) as n
      from deduped d
     where d.id is null
  ),
  fillers as (
    select l.id, pg_catalog.row_number() over (order by l.published_at desc, l.id) as n
      from live l
     where l.id not in (select d.id from deduped d where d.id is not null)
  ),
  final as (
    select d.slot, d.pos, d.rank, d.id from deduped d where d.id is not null
    union all
    select e.slot, e.pos, e.rank, f.id from empties e join fillers f on f.n = e.n
  )
  select f.slot, f.pos, l.title, l.dek, l.article_slug, l.section_slug, l.section_name, l.published_at,
         l.hero_storage_path, l.hero_alt, l.hero_credit, l.hero_width, l.hero_height, l.is_sponsored, l.byline
    from final f
    join live l on l.id = f.id
   order by f.rank;
$$;

create function public.latest_articles(lim integer, off integer)
returns setof public.article_card
language sql
stable
security definer
set search_path = ''
as $$
  select l.title, l.dek, l.article_slug, l.section_slug, l.section_name, l.published_at,
         l.hero_storage_path, l.hero_alt, l.hero_credit, l.hero_width, l.hero_height, l.is_sponsored, l.byline
    from public._live_articles() l
   order by l.published_at desc, l.id
   limit least(greatest(coalesce(latest_articles.lim, 0), 0), 20)
  offset greatest(coalesce(latest_articles.off, 0), 0);
$$;

create function public.section_articles(section_slug text, lim integer, off integer)
returns setof public.article_card
language sql
stable
security definer
set search_path = ''
as $$
  select l.title, l.dek, l.article_slug, l.section_slug, l.section_name, l.published_at,
         l.hero_storage_path, l.hero_alt, l.hero_credit, l.hero_width, l.hero_height, l.is_sponsored, l.byline
    from public._live_articles() l
   where l.section_slug = section_articles.section_slug
   order by l.published_at desc, l.id
   limit least(greatest(coalesce(section_articles.lim, 0), 0), 20)
  offset greatest(coalesce(section_articles.off, 0), 0);
$$;

create function public.section_article_count(section_slug text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public._live_articles() l where l.section_slug = section_article_count.section_slug;
$$;

create function public.tag_articles(tag_slug text, lim integer, off integer)
returns setof public.article_card
language sql
stable
security definer
set search_path = ''
as $$
  select l.title, l.dek, l.article_slug, l.section_slug, l.section_name, l.published_at,
         l.hero_storage_path, l.hero_alt, l.hero_credit, l.hero_width, l.hero_height, l.is_sponsored, l.byline
    from public._live_articles() l
   where exists (
     select 1 from public.article_tags at
       join public.tags t on t.id = at.tag_id
      where at.article_id = l.id and t.slug = tag_articles.tag_slug
   )
   order by l.published_at desc, l.id
   limit least(greatest(coalesce(tag_articles.lim, 0), 0), 20)
  offset greatest(coalesce(tag_articles.off, 0), 0);
$$;

create function public.tag_article_count(tag_slug text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
    from public._live_articles() l
   where exists (
     select 1 from public.article_tags at
       join public.tags t on t.id = at.tag_id
      where at.article_id = l.id and t.slug = tag_article_count.tag_slug
   );
$$;

-- Name, bio, disclosure and slug of someone with at least one live article. Never email or role.
create function public.author_public(author_slug text)
returns table (display_name text, bio text, disclosure text, slug text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.display_name, p.bio, d.text, p.slug
    from public.profiles p
    left join public.disclosures d on d.profile_id = p.id
   where p.slug = author_public.author_slug
     and exists (
       select 1 from public.article_authors aa
         join public._live_articles() l on l.id = aa.article_id
        where aa.profile_id = p.id
     )
   limit 1;
$$;

create function public.author_articles(author_slug text, lim integer, off integer)
returns setof public.article_card
language sql
stable
security definer
set search_path = ''
as $$
  select l.title, l.dek, l.article_slug, l.section_slug, l.section_name, l.published_at,
         l.hero_storage_path, l.hero_alt, l.hero_credit, l.hero_width, l.hero_height, l.is_sponsored, l.byline
    from public._live_articles() l
   where exists (
     select 1 from public.article_authors aa
       join public.profiles p on p.id = aa.profile_id
      where aa.article_id = l.id and p.slug = author_articles.author_slug
   )
   order by l.published_at desc, l.id
   limit least(greatest(coalesce(author_articles.lim, 0), 0), 20)
  offset greatest(coalesce(author_articles.off, 0), 0);
$$;

create function public.author_article_count(author_slug text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
    from public._live_articles() l
   where exists (
     select 1 from public.article_authors aa
       join public.profiles p on p.id = aa.profile_id
      where aa.article_id = l.id and p.slug = author_article_count.author_slug
   );
$$;

create function public.most_read(lim integer)
returns setof public.article_card
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  n integer := least(greatest(coalesce(most_read.lim, 5), 0), 5);
begin
  return query
    select l.title, l.dek, l.article_slug, l.section_slug, l.section_name, l.published_at,
           l.hero_storage_path, l.hero_alt, l.hero_credit, l.hero_width, l.hero_height, l.is_sponsored, l.byline
      from public._live_articles() l
      join (
        select v.article_id, sum(v.views) as total
          from public.article_view_days v
         where v.day > current_date - 7
         group by v.article_id
      ) t on t.article_id = l.id
     order by t.total desc, l.published_at desc
     limit n;
  if not found then
    -- No views yet: newest live articles, so the rail is never empty.
    return query
      select l.title, l.dek, l.article_slug, l.section_slug, l.section_name, l.published_at,
             l.hero_storage_path, l.hero_alt, l.hero_credit, l.hero_width, l.hero_height, l.is_sponsored, l.byline
        from public._live_articles() l
       order by l.published_at desc, l.id
       limit n;
  end if;
end;
$$;

-- Up to 4 other live articles sharing a tag with a live article.
create function public.related_articles(article uuid)
returns setof public.article_card
language sql
stable
security definer
set search_path = ''
as $$
  with live as (
    select * from public._live_articles()
  ),
  source_tags as (
    select at.tag_id
      from public.article_tags at
     where at.article_id = related_articles.article
       and exists (select 1 from live l where l.id = related_articles.article)
  ),
  scored as (
    select at.article_id, count(*) as shared
      from public.article_tags at
      join source_tags st on st.tag_id = at.tag_id
     where at.article_id <> related_articles.article
     group by at.article_id
  )
  select l.title, l.dek, l.article_slug, l.section_slug, l.section_name, l.published_at,
         l.hero_storage_path, l.hero_alt, l.hero_credit, l.hero_width, l.hero_height, l.is_sponsored, l.byline
    from scored s
    join live l on l.id = s.article_id
   order by s.shared desc, l.published_at desc, l.id
   limit 4;
$$;

-- article_bylines() plus each author's public slug, for linking to /author/<slug>.
create function public.article_public_bylines(article uuid)
returns table (display_name text, disclosure text, author_slug text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.display_name, d.text, p.slug
    from public.articles a
    join public.article_authors aa on aa.article_id = a.id
    join public.profiles p on p.id = aa.profile_id
    left join public.disclosures d on d.profile_id = aa.profile_id
   where a.id = article_public_bylines.article
     and (
       (a.status = 'published' and a.published_at is not null and a.published_at <= pg_catalog.now())
       or (a.status = 'scheduled' and a.scheduled_for is not null and a.scheduled_for <= pg_catalog.now())
     )
   order by aa.sort, p.display_name;
$$;

-- One view per hashed visitor per article per day, live articles only.
create function public.record_article_view(article uuid, ip_hash text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  site uuid;
  inserted integer;
begin
  if record_article_view.article is null
     or record_article_view.ip_hash is null
     or char_length(record_article_view.ip_hash) > 64 then
    return;
  end if;

  select a.site_id into site
    from public.articles a
   where a.id = record_article_view.article
     and (
       (a.status = 'published' and a.published_at is not null and a.published_at <= pg_catalog.now())
       or (a.status = 'scheduled' and a.scheduled_for is not null and a.scheduled_for <= pg_catalog.now())
     );
  if site is null then
    return;
  end if;

  insert into public.article_view_seen (site_id, article_id, day, ip_hash)
  values (site, record_article_view.article, current_date, record_article_view.ip_hash)
  on conflict do nothing;
  get diagnostics inserted = row_count;
  if inserted = 0 then
    return;
  end if;

  insert into public.article_view_days as v (site_id, article_id, day, views)
  values (site, record_article_view.article, current_date, 1)
  on conflict (article_id, day) do update set views = v.views + 1;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: every public read function is callable by anon and authenticated.
-- ---------------------------------------------------------------------------

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.homepage_public()',
    'public.latest_articles(integer, integer)',
    'public.section_articles(text, integer, integer)',
    'public.section_article_count(text)',
    'public.tag_articles(text, integer, integer)',
    'public.tag_article_count(text)',
    'public.author_public(text)',
    'public.author_articles(text, integer, integer)',
    'public.author_article_count(text)',
    'public.most_read(integer)',
    'public.related_articles(uuid)',
    'public.article_public_bylines(uuid)',
    'public.record_article_view(uuid, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to anon, authenticated', fn);
  end loop;
end;
$$;
