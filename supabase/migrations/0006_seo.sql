-- 0006_seo.sql — ranked search, old-address redirects.
--
-- Assumes 0005 is applied. articles.search, articles_set_search() and
-- articles_search_idx are unchanged. Every public function reads live articles
-- through public._live_articles(), so none can return a draft, an email, a role
-- or a full body.

-- ---------------------------------------------------------------------------
-- Search
-- ---------------------------------------------------------------------------

-- Plain text for snippets: the same title / dek / tag-stripped body the search
-- vector is built from, with script and style contents dropped and no angle
-- brackets left, so a snippet can never carry HTML. Internal, not granted.
create function public._search_text(title text, dek text, body_html text)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select pg_catalog.regexp_replace(
    pg_catalog.replace(
      pg_catalog.replace(
        pg_catalog.replace(
          pg_catalog.replace(
            pg_catalog.regexp_replace(
              pg_catalog.regexp_replace(
                pg_catalog.regexp_replace(
                  pg_catalog.regexp_replace(
                    coalesce(_search_text.title, '') || ' ' || coalesce(_search_text.dek, '') || ' ' || coalesce(_search_text.body_html, ''),
                    '<script.*?</script\s*>', ' ', 'gi'
                  ),
                  '<style.*?</style\s*>', ' ', 'gi'
                ),
                '<[^>]*>', ' ', 'g'
              ),
              '&(lt|gt|#0*60|#0*62|#x0*3c|#x0*3e);|[<>]', ' ', 'gi'
            ),
            '&nbsp;', ' '
          ),
          '&quot;', '"'
        ),
        '&#39;', ''''
      ),
      '&amp;', '&'
    ),
    '\s+', ' ', 'g'
  );
$$;

create function public.search_articles(q text, section_slug text, page integer)
returns table (
  title text,
  dek text,
  article_slug text,
  section_slug text,
  section_name text,
  published_at timestamptz,
  is_sponsored boolean,
  snippet text
)
language sql
stable
security definer
set search_path = ''
as $$
  with input as (
    select pg_catalog.left(pg_catalog.btrim(coalesce(search_articles.q, '')), 80) as q
  ),
  query as (
    select pg_catalog.websearch_to_tsquery('pg_catalog.english'::pg_catalog.regconfig, i.q) as tsq
      from input i
     where i.q <> ''
       and search_articles.page between 1 and 100
  )
  select l.title, l.dek, l.article_slug, l.section_slug, l.section_name, l.published_at, l.is_sponsored,
         pg_catalog.ts_headline(
           'pg_catalog.english'::pg_catalog.regconfig,
           public._search_text(a.title, a.dek, a.body_html),
           qq.tsq,
           'MaxWords=30, MinWords=12, StartSel=«, StopSel=»'
         )
    from query qq
    join public.articles a on a.search operator(pg_catalog.@@) qq.tsq
    join public._live_articles() l on l.id = a.id
   where nullif(pg_catalog.btrim(search_articles.section_slug), '') is null
      or l.section_slug = pg_catalog.btrim(search_articles.section_slug)
   order by pg_catalog.ts_rank(a.search, qq.tsq) desc, l.published_at desc, l.id
   limit 20
  offset (greatest(coalesce(search_articles.page, 1), 1) - 1) * 20;
$$;

create function public.search_article_count(q text, section_slug text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  with input as (
    select pg_catalog.left(pg_catalog.btrim(coalesce(search_article_count.q, '')), 80) as q
  ),
  query as (
    select pg_catalog.websearch_to_tsquery('pg_catalog.english'::pg_catalog.regconfig, i.q) as tsq
      from input i
     where i.q <> ''
  )
  select pg_catalog.count(*)::integer
    from query qq
    join public.articles a on a.search operator(pg_catalog.@@) qq.tsq
    join public._live_articles() l on l.id = a.id
   where nullif(pg_catalog.btrim(search_article_count.section_slug), '') is null
      or l.section_slug = pg_catalog.btrim(search_article_count.section_slug);
$$;

-- ---------------------------------------------------------------------------
-- slug_history: every public path an article used to have. Written only by the
-- trigger below and read only by the redirect functions: no client grants.
-- ---------------------------------------------------------------------------

create table public.slug_history (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  article_id uuid not null references public.articles (id) on delete cascade,
  section_slug text not null,
  slug text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, section_slug, slug)
);
create index slug_history_slug_idx on public.slug_history (slug);
create index slug_history_article_id_idx on public.slug_history (article_id);

create trigger set_updated_at
  before update on public.slug_history
  for each row execute function public.set_updated_at();

alter table public.slug_history enable row level security;
alter table public.slug_history force row level security;
revoke all on table public.slug_history from anon, authenticated;

create function public.articles_record_slug_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_section text;
  new_section text;
begin
  select s.slug into old_section from public.sections s where s.id = old.section_id;
  select s.slug into new_section from public.sections s where s.id = new.section_id;

  if old_section is not null then
    -- A path belongs to the article that most recently left it.
    insert into public.slug_history (site_id, article_id, section_slug, slug)
    values (old.site_id, old.id, old_section, old.slug)
    on conflict (site_id, section_slug, slug)
      do update set article_id = excluded.article_id, updated_at = pg_catalog.now();
  end if;

  -- The new path is current again, so it never redirects.
  delete from public.slug_history h
   where h.site_id = new.site_id
     and h.section_slug = new_section
     and h.slug = new.slug;

  return new;
end;
$$;

revoke all on function public.articles_record_slug_history() from public, anon, authenticated;

create trigger articles_record_slug_history
  before update of slug, section_id on public.articles
  for each row
  when (old.slug is distinct from new.slug or old.section_id is distinct from new.section_id)
  execute function public.articles_record_slug_history();

-- Where an old /<section>/<slug> lives now, or null. Null when an article still
-- has that slug (any status: the path is not "old"), or when the article that
-- used it is not live. Always the current path, so one hop, never a chain.
-- Checks the cheap indexed lookups first: the proxy calls this on article URLs.
create function public.article_slug_redirect(section text, slug text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target uuid;
  path text;
begin
  if exists (select 1 from public.articles a where a.slug = article_slug_redirect.slug) then
    return null;
  end if;

  select h.article_id into target
    from public.slug_history h
   where h.section_slug = article_slug_redirect.section
     and h.slug = article_slug_redirect.slug
   order by h.updated_at desc
   limit 1;
  if target is null then
    return null;
  end if;

  select '/' || l.section_slug || '/' || l.article_slug into path
    from public._live_articles() l
   where l.id = target;
  return path;
end;
$$;

-- Same rules, for /articles/<slug> where the old section is unknown: the most
-- recently vacated path with that slug whose article is live.
create function public.article_slug_redirect_any(slug text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  path text;
begin
  if exists (select 1 from public.articles a where a.slug = article_slug_redirect_any.slug) then
    return null;
  end if;
  if not exists (select 1 from public.slug_history h where h.slug = article_slug_redirect_any.slug) then
    return null;
  end if;

  select '/' || l.section_slug || '/' || l.article_slug into path
    from public.slug_history h
    join public._live_articles() l on l.id = h.article_id
   where h.slug = article_slug_redirect_any.slug
   order by h.updated_at desc
   limit 1;
  return path;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function public._search_text(text, text, text) from public, anon, authenticated;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.search_articles(text, text, integer)',
    'public.search_article_count(text, text)',
    'public.article_slug_redirect(text, text)',
    -- The legacy /articles/<slug> page calls this with the anon client.
    'public.article_slug_redirect_any(text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to anon, authenticated', fn);
  end loop;
end;
$$;
