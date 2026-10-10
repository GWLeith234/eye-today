-- 0019_editions.sql — the monthly e-edition: an ordered set of published stories with a cover, an editor's letter
-- and a PDF.
--
-- Editors manage editions under RLS. Anon has no table privileges. Readers get editions through definer functions:
-- an edition is visible when it is published and public_from has passed, or — for supporters, editors and admins —
-- when supporters_from has passed (early access). Its items return only stories that are still published.
-- PDFs live in a private bucket: editors upload, and the app streams a file only after edition_by_slug says the
-- reader may see it.

create table public.editions (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null check (char_length(btrim(title)) between 1 and 160 and title !~ '[<>]'),
  issue_month date not null check (extract(day from issue_month) = 1),
  cover_media_id uuid references public.media (id) on delete set null,
  letter_html text not null default '' check (char_length(letter_html) <= 20000),
  status text not null default 'draft' check (status in ('draft', 'published')),
  supporters_from timestamptz,
  public_from timestamptz,
  pdf_path text check (pdf_path is null or pdf_path ~ '^[0-9a-f-]{36}/[0-9]+\.pdf$'),
  pdf_generated_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, slug),
  check (supporters_from is null or public_from is null or supporters_from <= public_from),
  check (status = 'draft' or public_from is not null)
);
create index editions_site_month_idx on public.editions (site_id, issue_month desc);
create index editions_cover_media_idx on public.editions (cover_media_id);
create index editions_created_by_idx on public.editions (created_by);

create table public.edition_items (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  edition_id uuid not null references public.editions (id) on delete cascade,
  article_id uuid not null references public.articles (id) on delete cascade,
  sort integer not null default 0 check (sort between 0 and 999),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (edition_id, article_id)
);
create index edition_items_edition_sort_idx on public.edition_items (edition_id, sort);
create index edition_items_article_idx on public.edition_items (article_id);
create index edition_items_site_id_idx on public.edition_items (site_id);

create trigger set_updated_at before update on public.editions for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.edition_items for each row execute function public.set_updated_at();

alter table public.editions enable row level security;
alter table public.editions force row level security;
alter table public.edition_items enable row level security;
alter table public.edition_items force row level security;
revoke all on table public.editions, public.edition_items from anon, authenticated;
grant select, insert, update, delete on table public.editions, public.edition_items to authenticated;

create policy "editors manage editions" on public.editions for all to authenticated
  using ((select public.current_app_role()) in ('editor', 'admin'))
  with check ((select public.current_app_role()) in ('editor', 'admin'));
create policy "editors manage edition items" on public.edition_items for all to authenticated
  using ((select public.current_app_role()) in ('editor', 'admin'))
  with check ((select public.current_app_role()) in ('editor', 'admin'));

-- Covers reach readers through the definer reads below (path and alt), so media needs no new policy.

-- ---------------------------------------------------------------------------
-- PDF storage: private bucket, editors write, nobody else reads directly.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('editions', 'editions', false, 31457280, array['application/pdf'])
on conflict (id) do nothing;

create policy "editors read edition files"
  on storage.objects for select to authenticated
  using (bucket_id = 'editions' and (select public.current_app_role()) in ('editor', 'admin'));
create policy "editors add edition files"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'editions' and (select public.current_app_role()) in ('editor', 'admin'));
create policy "editors replace edition files"
  on storage.objects for update to authenticated
  using (bucket_id = 'editions' and (select public.current_app_role()) in ('editor', 'admin'))
  with check (bucket_id = 'editions' and (select public.current_app_role()) in ('editor', 'admin'));
create policy "editors remove edition files"
  on storage.objects for delete to authenticated
  using (bucket_id = 'editions' and (select public.current_app_role()) in ('editor', 'admin'));

-- ---------------------------------------------------------------------------
-- Public reads
-- ---------------------------------------------------------------------------

-- 'public', 'early' (a supporter, editor or admin before public_from), or null when the caller may not see it.
create function public._edition_access(e public.editions)
returns text
language sql
stable
set search_path = ''
as $$
  select case
           when e.status <> 'published' then null
           when e.public_from is not null and e.public_from <= pg_catalog.now() then 'public'
           when e.supporters_from is not null and e.supporters_from <= pg_catalog.now()
                and (select public.current_app_role()) in ('supporter', 'editor', 'admin') then 'early'
           else null
         end;
$$;

revoke all on function public._edition_access(public.editions) from public, anon, authenticated;

create function public.editions_public()
returns table (
  slug text, title text, issue_month date, cover_storage_path text, cover_alt text, access text,
  public_from timestamptz, story_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.slug, e.title, e.issue_month, m.storage_path, m.alt, public._edition_access(e), e.public_from,
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
  id uuid, slug text, title text, issue_month date, cover_storage_path text, cover_alt text, letter_html text,
  access text, public_from timestamptz, pdf_path text, pdf_generated_at timestamptz, updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.slug, e.title, e.issue_month, m.storage_path, m.alt, e.letter_html, public._edition_access(e),
         e.public_from, e.pdf_path, e.pdf_generated_at, e.updated_at
    from public.editions e
    join public.sites s on s.id = e.site_id and s.slug = 'eyetoday'
    left join public.media m on m.id = e.cover_media_id
   where e.slug = pg_catalog.btrim(coalesce(p_slug, '')) and public._edition_access(e) is not null
   limit 1;
$$;

-- The stories of an edition the caller may see, in order. Unpublished or future stories drop out.
create function public.edition_stories(p_edition uuid)
returns table (
  sort integer, article_id uuid, article_slug text, section_slug text, section_name text, title text, dek text,
  body_html text, published_at timestamptz, hero_storage_path text, hero_alt text, hero_credit text, byline text
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.sort, a.id, a.slug, sec.slug, sec.name, a.title, a.dek, a.body_html, a.published_at,
         m.storage_path, m.alt, m.credit,
         (select pg_catalog.string_agg(coalesce(nullif(pg_catalog.btrim(p.display_name), ''), 'Eye Today contributor'), ', ' order by aa.sort, aa.created_at)
            from public.article_authors aa join public.profiles p on p.id = aa.profile_id
           where aa.article_id = a.id)
    from public.edition_items i
    join public.editions e on e.id = i.edition_id
    join public.articles a on a.id = i.article_id
    join public.sections sec on sec.id = a.section_id
    left join public.media m on m.id = a.hero_media_id
   where i.edition_id = p_edition
     and public._edition_access(e) is not null
     and a.status = 'published' and a.published_at <= pg_catalog.now()
   order by i.sort, a.published_at, a.id;
$$;

revoke all on function public.editions_public() from public, anon, authenticated;
revoke all on function public.edition_by_slug(text) from public, anon, authenticated;
revoke all on function public.edition_stories(uuid) from public, anon, authenticated;
grant execute on function public.editions_public() to anon, authenticated;
grant execute on function public.edition_by_slug(text) to anon, authenticated;
grant execute on function public.edition_stories(uuid) to anon, authenticated;
