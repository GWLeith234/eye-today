-- 0002_rls.sql — auth, roles and row-level security.
--
-- Adds: the signup trigger that creates reader profiles, role helpers used by
-- policies, per-role policies on articles / media / revisions / disclosures /
-- profiles, the admin-only set_user_role() RPC, and the avatars bucket.
-- All role checks live in the database; the app only routes people around.

-- ---------------------------------------------------------------------------
-- Default privileges: nothing created by postgres in public from here on is
-- reachable by anon/authenticated until a migration grants it explicitly.
-- ---------------------------------------------------------------------------

alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Role helpers. SECURITY DEFINER so policies can read profiles without
-- recursing into the profiles policies.
-- ---------------------------------------------------------------------------

create function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p where p.id = auth.uid();
$$;

create function public.is_article_author(article uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.article_authors aa
    where aa.article_id = is_article_author.article
      and aa.profile_id = auth.uid()
  );
$$;

revoke all on function public.current_app_role() from public, anon;
revoke all on function public.is_article_author(uuid) from public, anon;
grant execute on function public.current_app_role() to authenticated;
grant execute on function public.is_article_author(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Signup trigger: every new auth user gets exactly one reader profile.
-- raw_user_meta_data.role is ignored on purpose.
-- ---------------------------------------------------------------------------

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  site uuid;
begin
  select s.id into site from public.sites s where s.slug = 'eyetoday';
  if site is null then
    raise exception 'handle_new_user: site "eyetoday" is missing';
  end if;

  insert into public.profiles (id, site_id, display_name, role)
  values (
    new.id,
    site,
    coalesce(
      nullif(pg_catalog.btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(pg_catalog.btrim(new.raw_user_meta_data ->> 'name'), ''),
      nullif(pg_catalog.split_part(coalesce(new.email, ''), '@', 1), '')
    ),
    'reader'
  );
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to supabase_auth_admin;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Profiles: users read and edit their own row (never the role column).
-- ---------------------------------------------------------------------------

grant select on table public.profiles to authenticated;
grant update (display_name, bio, avatar_url) on table public.profiles to authenticated;

-- Users can write avatar_url, so keep it to plain web URLs.
alter table public.profiles
  add constraint profiles_avatar_url_http check (avatar_url is null or avatar_url ~* '^https?://');

create policy "users read own profile"
  on public.profiles
  for select
  to authenticated
  using (id = (select auth.uid()));

-- /admin/users lists every profile through the admin's own session.
create policy "admins read all profiles"
  on public.profiles
  for select
  to authenticated
  using ((select public.current_app_role()) = 'admin');

create policy "users update own profile"
  on public.profiles
  for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Role changes are allowed for admins and for the table owner (migrations,
-- tests, and set_user_role, which runs as the owner). Everyone else —
-- including service_role — is rejected, so set_user_role is the only path.
create function public.profiles_lock_role()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.role is distinct from old.role then
    if exists (
      select 1
      from pg_catalog.pg_class c
      where c.oid = 'public.profiles'::pg_catalog.regclass
        and pg_catalog.pg_has_role(current_user, c.relowner, 'MEMBER')
    ) then
      return new;
    end if;
    if public.current_app_role() is distinct from 'admin' then
      raise exception 'role changes require an admin' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.profiles_lock_role() from public, anon, authenticated;

create trigger profiles_lock_role
  before update on public.profiles
  for each row execute function public.profiles_lock_role();

-- ---------------------------------------------------------------------------
-- set_user_role: the only supported way to change a role.
-- ---------------------------------------------------------------------------

create function public.set_user_role(target uuid, new_role public.app_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  old_role public.app_role;
  target_site uuid;
  other_admins integer;
begin
  -- 1. A real signed-in user (service_role has no uid).
  if caller is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Serialize role changes so two admins cannot demote each other at once.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('public.set_user_role'));

  -- 2. Caller is an admin.
  if public.current_app_role() is distinct from 'admin' then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  -- 3. Arguments present.
  if target is null or new_role is null then
    raise exception 'invalid arguments' using errcode = '22004';
  end if;

  -- 4. No self-changes.
  if target = caller then
    raise exception 'cannot change own role' using errcode = '42501';
  end if;

  -- 5. Target profile exists (never created here).
  select p.role, p.site_id
    into old_role, target_site
    from public.profiles p
   where p.id = target
     for update;
  if not found then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;

  -- 6. Keep at least one admin on the target's site.
  if old_role = 'admin' and new_role <> 'admin' then
    select count(*)
      into other_admins
      from public.profiles p
     where p.role = 'admin'
       and p.site_id = target_site
       and p.id <> target;
    if other_admins = 0 then
      raise exception 'last admin' using errcode = 'P0001';
    end if;
  end if;

  -- 7. No-op.
  if old_role = new_role then
    return;
  end if;

  -- 8. Change the role.
  update public.profiles set role = new_role where id = target;

  -- 9. Audit it.
  insert into public.audit_log (site_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    target_site,
    caller,
    'role.set',
    'profile',
    target,
    pg_catalog.jsonb_build_object('old_role', old_role, 'new_role', new_role)
  );
end;
$$;

revoke all on function public.set_user_role(uuid, public.app_role) from public, anon, authenticated;
grant execute on function public.set_user_role(uuid, public.app_role) to authenticated;

-- ---------------------------------------------------------------------------
-- Articles. The public "published articles are publicly readable" policy
-- from 0001 stays. Contributors work on their own drafts; editors on all.
-- ---------------------------------------------------------------------------

grant select, update on table public.articles to authenticated;

create policy "contributors read own drafts"
  on public.articles
  for select
  to authenticated
  using (
    (select public.current_app_role()) = 'contributor'
    and status in ('draft', 'submitted')
    and public.is_article_author(id)
  );

create policy "contributors update own drafts"
  on public.articles
  for update
  to authenticated
  using (
    (select public.current_app_role()) = 'contributor'
    and status in ('draft', 'submitted')
    and public.is_article_author(id)
  )
  with check (
    (select public.current_app_role()) = 'contributor'
    and status in ('draft', 'submitted')
    and public.is_article_author(id)
  );

create policy "editors read all articles"
  on public.articles
  for select
  to authenticated
  using ((select public.current_app_role()) in ('editor', 'admin'));

create policy "editors update all articles"
  on public.articles
  for update
  to authenticated
  using ((select public.current_app_role()) in ('editor', 'admin'))
  with check ((select public.current_app_role()) in ('editor', 'admin'));

-- ---------------------------------------------------------------------------
-- Media: owned by contributors, managed by editors. No public read, no delete.
-- ---------------------------------------------------------------------------

alter table public.media
  add column owner_id uuid references public.profiles (id) on delete set null;
create index media_owner_id_idx on public.media (owner_id);

grant select, insert, update on table public.media to authenticated;

create policy "contributors read own media"
  on public.media
  for select
  to authenticated
  using ((select public.current_app_role()) = 'contributor' and owner_id = (select auth.uid()));

create policy "contributors insert own media"
  on public.media
  for insert
  to authenticated
  with check ((select public.current_app_role()) = 'contributor' and owner_id = (select auth.uid()));

create policy "contributors update own media"
  on public.media
  for update
  to authenticated
  using ((select public.current_app_role()) = 'contributor' and owner_id = (select auth.uid()))
  with check ((select public.current_app_role()) = 'contributor' and owner_id = (select auth.uid()));

create policy "editors read all media"
  on public.media
  for select
  to authenticated
  using ((select public.current_app_role()) in ('editor', 'admin'));

create policy "editors insert media"
  on public.media
  for insert
  to authenticated
  with check ((select public.current_app_role()) in ('editor', 'admin'));

create policy "editors update all media"
  on public.media
  for update
  to authenticated
  using ((select public.current_app_role()) in ('editor', 'admin'))
  with check ((select public.current_app_role()) in ('editor', 'admin'));

-- ---------------------------------------------------------------------------
-- Article revisions: append-only history.
-- ---------------------------------------------------------------------------

grant select, insert on table public.article_revisions to authenticated;

create policy "contributors read own revisions"
  on public.article_revisions
  for select
  to authenticated
  using (
    (select public.current_app_role()) = 'contributor'
    and author_id = (select auth.uid())
    and public.is_article_author(article_id)
  );

create policy "contributors insert own revisions"
  on public.article_revisions
  for insert
  to authenticated
  with check (
    (select public.current_app_role()) = 'contributor'
    and author_id = (select auth.uid())
    and public.is_article_author(article_id)
  );

create policy "editors read all revisions"
  on public.article_revisions
  for select
  to authenticated
  using ((select public.current_app_role()) in ('editor', 'admin'));

create policy "editors insert revisions"
  on public.article_revisions
  for insert
  to authenticated
  with check ((select public.current_app_role()) in ('editor', 'admin'));

-- ---------------------------------------------------------------------------
-- Disclosures: each user manages their own; editors manage all.
-- ---------------------------------------------------------------------------

grant select, insert, update on table public.disclosures to authenticated;

create policy "users read own disclosures"
  on public.disclosures
  for select
  to authenticated
  using (profile_id = (select auth.uid()));

create policy "users insert own disclosures"
  on public.disclosures
  for insert
  to authenticated
  with check (profile_id = (select auth.uid()));

create policy "users update own disclosures"
  on public.disclosures
  for update
  to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

create policy "editors read all disclosures"
  on public.disclosures
  for select
  to authenticated
  using ((select public.current_app_role()) in ('editor', 'admin'));

create policy "editors insert disclosures"
  on public.disclosures
  for insert
  to authenticated
  with check ((select public.current_app_role()) in ('editor', 'admin'));

create policy "editors update all disclosures"
  on public.disclosures
  for update
  to authenticated
  using ((select public.current_app_role()) in ('editor', 'admin'))
  with check ((select public.current_app_role()) in ('editor', 'admin'));

-- ---------------------------------------------------------------------------
-- Avatars bucket: public read, owner-only writes under {uid}/...
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- SELECT is needed for upserts; reads for everyone else go through the public URL.
create policy "avatar owners read"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "avatar owners insert"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "avatar owners update"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "avatar owners delete"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
