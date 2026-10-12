-- 0025_newsroom_products.sql — Sprint 21: the curated news feed, the Legal Map category, the Trials & Funding
-- Tracker, and issue numbers on editions and newsletters.
--
-- Editors manage every new table under RLS. Anon has no table privileges and reads through definer functions
-- that return published rows for the Eye Today site only. Issue numbers are assigned by trigger under an
-- advisory lock so two editors creating issues at once never take the same number.

-- ---------------------------------------------------------------------------
-- Legal Map: a status category on every country page.
-- ---------------------------------------------------------------------------

alter table public.country_legal_status
  add column legal_category text not null default 'unclear'
    check (legal_category in ('unregulated', 'permitted', 'decriminalised', 'prohibited', 'unclear'));

create function public.legal_map_public()
returns table (country_code text, title text, legal_category text, as_of date, source_count integer, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select s.country_code, s.title, s.legal_category, s.as_of,
         pg_catalog.jsonb_array_length(s.sources)::integer, s.updated_at
    from public.country_legal_status s
    join public.sites site on site.id = s.site_id and site.slug = 'eyetoday'
   where s.status = 'published'
   order by s.legal_category, s.country_code;
$$;

revoke all on function public.legal_map_public() from public, anon, authenticated;
grant execute on function public.legal_map_public() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- News feed: other outlets' coverage, dated and credited. Never the full text.
-- ---------------------------------------------------------------------------

create table public.news_links (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  url text not null check (url ~ '^https://[^\s<>"'']+$' and char_length(url) <= 2000),
  title text not null check (char_length(btrim(title)) between 1 and 200 and title !~ '[<>]'),
  source_name text not null check (char_length(btrim(source_name)) between 1 and 120 and source_name !~ '[<>]'),
  published_on date not null,
  blurb text not null default '' check (char_length(blurb) <= 280 and blurb !~ '[<>]'),
  tags text[] not null default '{}' check (cardinality(tags) <= 10),
  status text not null default 'draft' check (status in ('draft', 'published')),
  added_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, url)
);
create index news_links_site_published_idx on public.news_links (site_id, status, published_on desc, created_at desc);
create index news_links_added_by_idx on public.news_links (added_by);

create trigger set_updated_at before update on public.news_links for each row execute function public.set_updated_at();

alter table public.news_links enable row level security;
alter table public.news_links force row level security;
revoke all on table public.news_links from anon, authenticated;
grant select, insert, update, delete on table public.news_links to authenticated;

create policy "editors manage news links" on public.news_links for all to authenticated
  using ((select public.current_app_role()) in ('editor', 'admin'))
  with check ((select public.current_app_role()) in ('editor', 'admin'));

-- Newest first. p_page is 1-based; 20 per page.
create function public.news_links_public(p_page integer default 1, lim integer default 20)
returns table (id uuid, url text, title text, source_name text, published_on date, blurb text, tags text[])
language sql
stable
security definer
set search_path = ''
as $$
  select n.id, n.url, n.title, n.source_name, n.published_on, n.blurb, n.tags
    from public.news_links n
    join public.sites s on s.id = n.site_id and s.slug = 'eyetoday'
   where n.status = 'published'
   order by n.published_on desc, n.created_at desc, n.id
   limit least(greatest(coalesce(lim, 20), 1), 50)
  offset (least(greatest(coalesce(p_page, 1), 1), 500) - 1) * least(greatest(coalesce(lim, 20), 1), 50);
$$;

create function public.news_links_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
    from public.news_links n
    join public.sites s on s.id = n.site_id and s.slug = 'eyetoday'
   where n.status = 'published';
$$;

revoke all on function public.news_links_public(integer, integer) from public, anon, authenticated;
revoke all on function public.news_links_count() from public, anon, authenticated;
grant execute on function public.news_links_public(integer, integer) to anon, authenticated;
grant execute on function public.news_links_count() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Trials & Funding Tracker.
-- ---------------------------------------------------------------------------

create table public.tracker_entries (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(slug) <= 80),
  kind text not null check (kind in ('trial', 'funding', 'regulatory')),
  title text not null check (char_length(btrim(title)) between 1 and 200 and title !~ '[<>]'),
  sponsor text not null default '' check (char_length(sponsor) <= 160 and sponsor !~ '[<>]'),
  stage text not null default '' check (char_length(stage) <= 60 and stage !~ '[<>]'),
  amount text not null default '' check (char_length(amount) <= 80 and amount !~ '[<>]'),
  jurisdiction text not null default '' check (char_length(jurisdiction) <= 120 and jurisdiction !~ '[<>]'),
  key_dates jsonb not null default '[]'::jsonb check (jsonb_typeof(key_dates) = 'array'),
  links jsonb not null default '[]'::jsonb check (jsonb_typeof(links) = 'array'),
  notes text not null default '' check (char_length(notes) <= 2000 and notes !~ '[<>]'),
  article_id uuid references public.articles (id) on delete set null,
  last_reviewed date,
  status text not null default 'draft' check (status in ('draft', 'published')),
  sort integer not null default 0 check (sort between 0 and 999),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, slug)
);
create index tracker_entries_site_kind_idx on public.tracker_entries (site_id, status, kind, sort);
create index tracker_entries_article_idx on public.tracker_entries (article_id);

create trigger set_updated_at before update on public.tracker_entries for each row execute function public.set_updated_at();

alter table public.tracker_entries enable row level security;
alter table public.tracker_entries force row level security;
revoke all on table public.tracker_entries from anon, authenticated;
grant select, insert, update, delete on table public.tracker_entries to authenticated;

create policy "editors manage tracker entries" on public.tracker_entries for all to authenticated
  using ((select public.current_app_role()) in ('editor', 'admin'))
  with check ((select public.current_app_role()) in ('editor', 'admin'));

-- A linked story appears only while it is published and due.
create function public.tracker_public(p_kind text default null)
returns table (
  id uuid, slug text, kind text, title text, sponsor text, stage text, amount text, jurisdiction text,
  key_dates jsonb, links jsonb, notes text, last_reviewed date, updated_at timestamptz,
  article_slug text, article_section text, article_title text
)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.slug, t.kind, t.title, t.sponsor, t.stage, t.amount, t.jurisdiction,
         t.key_dates, t.links, t.notes, t.last_reviewed, t.updated_at,
         a.slug, sec.slug, a.title
    from public.tracker_entries t
    join public.sites s on s.id = t.site_id and s.slug = 'eyetoday'
    left join public.articles a on a.id = t.article_id and a.status = 'published' and a.published_at <= pg_catalog.now()
    left join public.sections sec on sec.id = a.section_id
   where t.status = 'published'
     and (p_kind is null or t.kind = p_kind)
   order by t.kind, t.sort, t.last_reviewed desc nulls last, t.title
   limit 500;
$$;

revoke all on function public.tracker_public(text) from public, anon, authenticated;
grant execute on function public.tracker_public(text) to anon, authenticated;

-- Seed from the Sprint 21 brief, for sites that already exist. supabase/seed.sql repeats it for a fresh reset.
insert into public.tracker_entries (site_id, slug, kind, title, sponsor, stage, amount, jurisdiction, key_dates, links, notes, last_reviewed, status, sort)
select s.id, v.slug, v.kind, v.title, v.sponsor, v.stage, v.amount, v.jurisdiction, v.key_dates::jsonb, v.links::jsonb, v.notes, v.last_reviewed::date, 'published', v.sort
  from public.sites s
  cross join (values
    ('stanford-veterans-ibogaine-study', 'trial', 'Stanford veterans ibogaine study (MISTIC)', 'Stanford Medicine', 'Published; follow-up ongoing', '', 'United States / Mexico',
     '[{"label":"Results published","date":"2024-01-05"}]',
     '[{"title":"Nature Medicine paper","url":"https://www.nature.com/articles/s41591-023-02705-w"}]',
     'Thirty special-operations veterans treated with magnesium-ibogaine at a clinic in Mexico; the study reported improvements in disability, PTSD, depression and anxiety at one month.', '2026-10-11', 10),
    ('texas-sb-2308-ibogaine-programme', 'funding', 'Texas SB 2308 ibogaine clinical-trial programme', 'State of Texas', 'Enacted; grants in progress', 'USD 50 million', 'Texas, United States',
     '[{"label":"Signed into law","date":"2025-06-11"}]',
     '[{"title":"Texas Legislature Online","url":"https://capitol.texas.gov/BillLookup/History.aspx?LegSess=89R&Bill=SB2308"}]',
     'State funding for FDA-regulated ibogaine trials run with Texas institutions, matched by private money. The state keeps a share of any drug-development revenue.', '2026-10-11', 10),
    ('arpa-h-ascent-ibo', 'funding', 'ARPA-H ASCENT-IBO', 'ARPA-H', 'Programme announced', '', 'United States',
     '[]',
     '[{"title":"ARPA-H","url":"https://arpa-h.gov/"}]',
     'Federal programme aimed at ibogaine-based treatments for addiction and traumatic brain injury.', '2026-10-11', 20),
    ('fda-ibogaine-rfi-2026', 'regulatory', 'FDA request for information on ibogaine trial design', 'U.S. Food and Drug Administration', 'Open for comment', '', 'United States',
     '[{"label":"Comments close","date":"2026-11-20"}]',
     '[{"title":"Docket FDA-2026-N-10429","url":"https://www.regulations.gov/docket/FDA-2026-N-10429"}]',
     'The agency is asking how ibogaine trials should be designed and monitored, including cardiac safety.', '2026-10-11', 10),
    ('nimh-rapids-forecast', 'funding', 'NIMH RAPIDs funding opportunity (forecast)', 'National Institute of Mental Health', 'Forecast', '', 'United States',
     '[]',
     '[{"title":"NIMH funding","url":"https://www.nimh.nih.gov/funding"}]',
     'Rapid-acting psychedelic and dissociative treatments research; ibogaine-relevant work expected to be eligible.', '2026-10-11', 30),
    ('nida-oud-funding', 'funding', 'NIDA opioid-use-disorder medication development funding', 'National Institute on Drug Abuse', 'Open', '', 'United States',
     '[]',
     '[{"title":"NIDA funding","url":"https://nida.nih.gov/funding"}]',
     'Standing programmes for new OUD medications under which ibogaine analogues have been funded.', '2026-10-11', 40),
    ('noribogaine-ind-alcohol-use-disorder', 'trial', 'Noribogaine IND — alcohol use disorder', 'DemeRx / industry', 'IND stage', '', 'United States',
     '[]',
     '[{"title":"ClinicalTrials.gov","url":"https://clinicaltrials.gov/"}]',
     'Noribogaine, the main metabolite of ibogaine, being developed for alcohol use disorder.', '2026-10-11', 20)
  ) as v (slug, kind, title, sponsor, stage, amount, jurisdiction, key_dates, links, notes, last_reviewed, sort)
on conflict (site_id, slug) do nothing;

-- ---------------------------------------------------------------------------
-- Issue numbers. Editions count up by issue month per site; newsletters per list.
-- ---------------------------------------------------------------------------

alter table public.editions add column issue_number integer check (issue_number >= 1);
create unique index editions_site_issue_number_key on public.editions (site_id, issue_number) where issue_number is not null;

alter table public.newsletter_issues add column issue_number integer check (issue_number >= 1);
create unique index newsletter_issues_list_issue_number_key on public.newsletter_issues (list_id, issue_number) where issue_number is not null;

alter table public.newsletter_issues add column include_news boolean not null default false;

-- Backfill existing editions in month order: the October 2026 issue becomes No. 1.
with numbered as (
  select id, row_number() over (partition by site_id order by issue_month, created_at, id) as n
    from public.editions
)
update public.editions e set issue_number = numbered.n from numbered where numbered.id = e.id;

with numbered as (
  select id, row_number() over (partition by list_id order by created_at, id) as n
    from public.newsletter_issues
)
update public.newsletter_issues i set issue_number = numbered.n from numbered where numbered.id = i.id;

-- Next number for the site, taken under a transaction lock so concurrent inserts stay distinct.
create function public._assign_edition_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.issue_number is not null then return new; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('editions:' || new.site_id::text));
  select coalesce(max(e.issue_number), 0) + 1 into new.issue_number from public.editions e where e.site_id = new.site_id;
  return new;
end;
$$;

create function public._assign_newsletter_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.issue_number is not null then return new; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('newsletter_issues:' || new.list_id::text));
  select coalesce(max(i.issue_number), 0) + 1 into new.issue_number from public.newsletter_issues i where i.list_id = new.list_id;
  return new;
end;
$$;

revoke all on function public._assign_edition_number() from public, anon, authenticated;
revoke all on function public._assign_newsletter_number() from public, anon, authenticated;

create trigger assign_issue_number before insert on public.editions for each row execute function public._assign_edition_number();
create trigger assign_issue_number before insert on public.newsletter_issues for each row execute function public._assign_newsletter_number();

-- The public edition reads now carry the number. Return types change, so the functions are recreated.
drop function public.editions_public();
drop function public.edition_by_slug(text);

create function public.editions_public()
returns table (
  slug text, title text, issue_month date, issue_number integer, cover_storage_path text, cover_alt text, access text,
  public_from timestamptz, story_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.slug, e.title, e.issue_month, e.issue_number, m.storage_path, m.alt, public._edition_access(e), e.public_from,
         (select count(*)::integer
            from public.edition_items i join public.articles a on a.id = i.article_id
           where i.edition_id = e.id and a.status = 'published' and a.published_at <= pg_catalog.now())
    from public.editions e
    join public.sites s on s.id = e.site_id and s.slug = 'eyetoday'
    left join public.media m on m.id = e.cover_media_id
   where public._edition_access(e) is not null
   order by e.issue_month desc, e.id
   limit 120;
$$;

create function public.edition_by_slug(p_slug text)
returns table (
  id uuid, slug text, title text, issue_month date, issue_number integer, cover_storage_path text, cover_alt text, letter_html text,
  access text, public_from timestamptz, pdf_path text, pdf_generated_at timestamptz, updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.slug, e.title, e.issue_month, e.issue_number, m.storage_path, m.alt, e.letter_html, public._edition_access(e),
         e.public_from, e.pdf_path, e.pdf_generated_at, e.updated_at
    from public.editions e
    join public.sites s on s.id = e.site_id and s.slug = 'eyetoday'
    left join public.media m on m.id = e.cover_media_id
   where e.slug = pg_catalog.btrim(coalesce(p_slug, '')) and public._edition_access(e) is not null
   limit 1;
$$;

revoke all on function public.editions_public() from public, anon, authenticated;
revoke all on function public.edition_by_slug(text) from public, anon, authenticated;
grant execute on function public.editions_public() to anon, authenticated;
grant execute on function public.edition_by_slug(text) to anon, authenticated;
