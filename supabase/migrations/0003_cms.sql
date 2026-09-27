-- 0003_cms.sql — newsroom CMS.
--
-- Editors and admins write articles, authors, tags, sections and media;
-- due scheduled articles become public on time; publish_due_articles()
-- flips their status for the cron. No new tables.

-- ---------------------------------------------------------------------------
-- Articles: editors insert. The 0002 editor UPDATE policy stays; no DELETE.
-- ---------------------------------------------------------------------------

grant insert on table public.articles to authenticated;

create policy "editors insert articles"
  on public.articles
  for insert
  to authenticated
  with check (
    (select public.current_app_role()) in ('editor', 'admin')
    and status in ('draft', 'scheduled', 'published')
  );

-- In addition to the 0001 "published articles are publicly readable" policy:
-- a scheduled article is public as soon as its time arrives, before the cron
-- has changed its status.
create policy "due scheduled articles are publicly readable"
  on public.articles
  for select
  to anon, authenticated
  using (
    status = 'scheduled'
    and scheduled_for is not null
    and scheduled_for <= now()
  );

-- ---------------------------------------------------------------------------
-- Authors and tags on articles.
-- ---------------------------------------------------------------------------

grant select, insert, delete on table public.article_authors to authenticated;
grant select, insert, delete on table public.article_tags to authenticated;

create policy "editors read article authors"
  on public.article_authors for select to authenticated
  using ((select public.current_app_role()) in ('editor', 'admin'));

create policy "editors insert article authors"
  on public.article_authors for insert to authenticated
  with check ((select public.current_app_role()) in ('editor', 'admin'));

create policy "editors delete article authors"
  on public.article_authors for delete to authenticated
  using ((select public.current_app_role()) in ('editor', 'admin'));

create policy "editors read article tags"
  on public.article_tags for select to authenticated
  using ((select public.current_app_role()) in ('editor', 'admin'));

create policy "editors insert article tags"
  on public.article_tags for insert to authenticated
  with check ((select public.current_app_role()) in ('editor', 'admin'));

create policy "editors delete article tags"
  on public.article_tags for delete to authenticated
  using ((select public.current_app_role()) in ('editor', 'admin'));

-- ---------------------------------------------------------------------------
-- Sections and tags: editors create and rename. No DELETE on sections
-- (articles reference them) and none on tags this sprint.
-- ---------------------------------------------------------------------------

grant insert, update on table public.sections to authenticated;
grant select on table public.tags to anon, authenticated;
grant insert, update on table public.tags to authenticated;

create policy "tags are publicly readable"
  on public.tags for select to anon, authenticated
  using (true);

create policy "editors insert sections"
  on public.sections for insert to authenticated
  with check ((select public.current_app_role()) in ('editor', 'admin'));

create policy "editors update sections"
  on public.sections for update to authenticated
  using ((select public.current_app_role()) in ('editor', 'admin'))
  with check ((select public.current_app_role()) in ('editor', 'admin'));

create policy "editors insert tags"
  on public.tags for insert to authenticated
  with check ((select public.current_app_role()) in ('editor', 'admin'));

create policy "editors update tags"
  on public.tags for update to authenticated
  using ((select public.current_app_role()) in ('editor', 'admin'))
  with check ((select public.current_app_role()) in ('editor', 'admin'));

-- ---------------------------------------------------------------------------
-- Profiles: editors read everyone for the author picker. The column grant
-- from 0002 (display_name, bio, avatar_url) and profiles_lock_role still stop
-- anyone but set_user_role from changing a role.
-- ---------------------------------------------------------------------------

create policy "editors read all profiles"
  on public.profiles for select to authenticated
  using ((select public.current_app_role()) in ('editor', 'admin'));

-- ---------------------------------------------------------------------------
-- publish_due_articles: called by the cron route with the service role.
-- ---------------------------------------------------------------------------

create function public.publish_due_articles()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  published integer;
begin
  update public.articles
     set status = 'published',
         published_at = scheduled_for
   where status = 'scheduled'
     and scheduled_for is not null
     and scheduled_for <= pg_catalog.now();
  get diagnostics published = row_count;
  return published;
end;
$$;

revoke all on function public.publish_due_articles() from public, anon, authenticated;
grant execute on function public.publish_due_articles() to service_role;

-- ---------------------------------------------------------------------------
-- Revisions carry a snapshot of the article's metadata for restore.
-- ---------------------------------------------------------------------------

alter table public.article_revisions add column snapshot jsonb;

-- ---------------------------------------------------------------------------
-- Media bucket: public read, editors manage objects. SVG is rejected in the
-- app by sniffing bytes; the MIME allowlist here is a second fence.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 8388608, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

create policy "editors read media objects"
  on storage.objects for select to authenticated
  using (bucket_id = 'media' and (select public.current_app_role()) in ('editor', 'admin'));

create policy "editors insert media objects"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (select public.current_app_role()) in ('editor', 'admin'));

create policy "editors update media objects"
  on storage.objects for update to authenticated
  using (bucket_id = 'media' and (select public.current_app_role()) in ('editor', 'admin'))
  with check (bucket_id = 'media' and (select public.current_app_role()) in ('editor', 'admin'));

create policy "editors delete media objects"
  on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (select public.current_app_role()) in ('editor', 'admin'));
