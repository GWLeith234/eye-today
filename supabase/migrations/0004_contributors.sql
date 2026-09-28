-- 0004_contributors.sql — contributor portal and editorial workflow.
--
-- Contributors draft and submit their own stories (never publish), editors
-- review them with notes, public applications feed the contributor pipeline,
-- and bylines with disclosures are readable once an article is live.

-- ---------------------------------------------------------------------------
-- articles.created_by
-- ---------------------------------------------------------------------------

alter table public.articles
  add column created_by uuid default auth.uid() references public.profiles (id) on delete set null;
create index articles_created_by_idx on public.articles (created_by);

-- Backfill from each article's earliest author row; articles without authors stay null.
update public.articles a
   set created_by = first_author.profile_id
  from (
    select distinct on (aa.article_id) aa.article_id, aa.profile_id
      from public.article_authors aa
     order by aa.article_id, aa.created_at, aa.sort
  ) first_author
 where first_author.article_id = a.id
   and a.created_by is null;

-- created_by is set once. Update policies only see the new row, so without this
-- a co-author could set created_by to themselves and take over the draft.
-- Clearing it (the profile FK's on delete set null) is still allowed.
create function public.articles_lock_created_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.created_by is distinct from old.created_by and new.created_by is not null then
    raise exception 'created_by cannot be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.articles_lock_created_by() from public, anon, authenticated;

create trigger articles_lock_created_by
  before update of created_by on public.articles
  for each row execute function public.articles_lock_created_by();

-- ---------------------------------------------------------------------------
-- profiles.email, kept in sync from auth.users. Not user-editable: the 0002
-- column UPDATE grant (display_name, bio, avatar_url) is unchanged.
-- ---------------------------------------------------------------------------

alter table public.profiles add column email text;

update public.profiles p
   set email = u.email
  from auth.users u
 where u.id = p.id;

create function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

revoke all on function public.sync_profile_email() from public, anon, authenticated;
grant execute on function public.sync_profile_email() to supabase_auth_admin;

-- AFTER triggers fire in name order, so this runs after on_auth_user_created
-- has inserted the profile.
create trigger sync_profile_email
  after insert or update of email on auth.users
  for each row execute function public.sync_profile_email();

-- ---------------------------------------------------------------------------
-- disclosures: one per person, never blank.
-- ---------------------------------------------------------------------------

delete from public.disclosures d
 using public.disclosures newer
 where newer.profile_id = d.profile_id
   and (newer.created_at, newer.id) > (d.created_at, d.id);

alter table public.disclosures
  add constraint disclosures_profile_id_key unique (profile_id),
  add constraint disclosures_text_not_blank check (char_length(pg_catalog.btrim(text)) > 0);

-- ---------------------------------------------------------------------------
-- Contributor article policies (replacing the 0002 pair).
-- ---------------------------------------------------------------------------

drop policy "contributors read own drafts" on public.articles;
drop policy "contributors update own drafts" on public.articles;

create policy "contributors read own articles"
  on public.articles
  for select
  to authenticated
  using (
    (select public.current_app_role()) = 'contributor'
    and (public.is_article_author(id) or created_by = (select auth.uid()))
  );

create policy "contributors insert drafts"
  on public.articles
  for insert
  to authenticated
  with check (
    (select public.current_app_role()) = 'contributor'
    and status = 'draft'
    and not is_sponsored
    and created_by = (select auth.uid())
  );

create policy "contributors update own drafts"
  on public.articles
  for update
  to authenticated
  using (
    (select public.current_app_role()) = 'contributor'
    and status = 'draft'
    and not is_sponsored
    and (public.is_article_author(id) or created_by = (select auth.uid()))
  )
  with check (
    (select public.current_app_role()) = 'contributor'
    and status in ('draft', 'submitted')
    and not is_sponsored
    and created_by = (select auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Contributor access to article_authors and article_tags.
-- ---------------------------------------------------------------------------

create function public.is_article_creator(article uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.articles a
    where a.id = is_article_creator.article
      and a.created_by = auth.uid()
  );
$$;

create function public.article_status(article uuid)
returns public.article_status
language sql
stable
security definer
set search_path = ''
as $$
  -- Only for people who may already see the story: editors, admins, its creator
  -- or an author. Everyone else gets null, so a draft's status does not leak.
  select a.status
    from public.articles a
   where a.id = article_status.article
     and (
       public.current_app_role() in ('editor', 'admin')
       or a.created_by = auth.uid()
       or public.is_article_author(a.id)
     );
$$;

revoke all on function public.is_article_creator(uuid) from public, anon;
revoke all on function public.article_status(uuid) from public, anon;
grant execute on function public.is_article_creator(uuid) to authenticated;
grant execute on function public.article_status(uuid) to authenticated;

create policy "contributors read own article authors"
  on public.article_authors for select to authenticated
  using (
    (select public.current_app_role()) = 'contributor'
    and (public.is_article_author(article_id) or public.is_article_creator(article_id))
  );

create policy "contributors add themselves to own drafts"
  on public.article_authors for insert to authenticated
  with check (
    (select public.current_app_role()) = 'contributor'
    and profile_id = (select auth.uid())
    and public.is_article_creator(article_id)
    and public.article_status(article_id) = 'draft'
  );

create policy "contributors read own article tags"
  on public.article_tags for select to authenticated
  using (
    (select public.current_app_role()) = 'contributor'
    and (public.is_article_author(article_id) or public.is_article_creator(article_id))
  );

create policy "contributors tag own drafts"
  on public.article_tags for insert to authenticated
  with check (
    (select public.current_app_role()) = 'contributor'
    and public.is_article_author(article_id)
    and public.article_status(article_id) = 'draft'
  );

create policy "contributors untag own drafts"
  on public.article_tags for delete to authenticated
  using (
    (select public.current_app_role()) = 'contributor'
    and public.is_article_author(article_id)
    and public.article_status(article_id) = 'draft'
  );

-- ---------------------------------------------------------------------------
-- Submission gate: every author needs a disclosure before a story is submitted.
-- ---------------------------------------------------------------------------

create function public.articles_require_disclosure()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'submitted'
     and (tg_op = 'INSERT' or old.status is distinct from new.status)
     and exists (
       select 1
         from public.article_authors aa
        where aa.article_id = new.id
          and not exists (select 1 from public.disclosures d where d.profile_id = aa.profile_id)
     ) then
    raise exception 'disclosure required' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.articles_require_disclosure() from public, anon, authenticated;

create trigger articles_require_disclosure
  before insert or update on public.articles
  for each row execute function public.articles_require_disclosure();

-- ---------------------------------------------------------------------------
-- contributor_applications: public "write for us" form.
-- ---------------------------------------------------------------------------

create table public.contributor_applications (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  name text not null,
  email text not null,
  bio text,
  affiliations text,
  sample_links text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reject_reason text,
  reviewed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index contributor_applications_status_created_idx on public.contributor_applications (status, created_at);
create unique index contributor_applications_pending_email_key
  on public.contributor_applications (lower(email)) where status = 'pending';
create index contributor_applications_email_created_idx on public.contributor_applications (lower(email), created_at);
create index contributor_applications_site_id_idx on public.contributor_applications (site_id);
create index contributor_applications_reviewed_by_idx on public.contributor_applications (reviewed_by);

-- Fills site_id (anon cannot read sites) and caps applications per email:
-- at most 3 in 24 hours. This holds for direct API inserts too.
create function public.contributor_applications_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.site_id is null then
    select s.id into new.site_id from public.sites s where s.slug = 'eyetoday';
  end if;
  if (
    select count(*)
      from public.contributor_applications ca
     where lower(ca.email) = lower(new.email)
       and ca.created_at > pg_catalog.now() - interval '24 hours'
  ) >= 3 then
    raise exception 'too many applications' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.contributor_applications_before_insert() from public, anon, authenticated;

create trigger contributor_applications_before_insert
  before insert on public.contributor_applications
  for each row execute function public.contributor_applications_before_insert();

create trigger set_updated_at
  before update on public.contributor_applications
  for each row execute function public.set_updated_at();

alter table public.contributor_applications enable row level security;
alter table public.contributor_applications force row level security;
revoke all on table public.contributor_applications from anon, authenticated;
grant insert on table public.contributor_applications to anon, authenticated;
grant select, update on table public.contributor_applications to authenticated;

create policy "anyone can apply"
  on public.contributor_applications for insert to anon, authenticated
  with check (status = 'pending' and reviewed_by is null and reject_reason is null);

create policy "editors read applications"
  on public.contributor_applications for select to authenticated
  using ((select public.current_app_role()) in ('editor', 'admin'));

create policy "editors review applications"
  on public.contributor_applications for update to authenticated
  using ((select public.current_app_role()) in ('editor', 'admin'))
  with check ((select public.current_app_role()) in ('editor', 'admin'));

-- ---------------------------------------------------------------------------
-- editorial_notes: editor-to-author notes on a story. Not public comments.
-- ---------------------------------------------------------------------------

create table public.editorial_notes (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  article_id uuid not null references public.articles (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  body text not null check (char_length(pg_catalog.btrim(body)) > 0),
  resolved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index editorial_notes_article_created_idx on public.editorial_notes (article_id, created_at);
create index editorial_notes_site_id_idx on public.editorial_notes (site_id);
create index editorial_notes_author_id_idx on public.editorial_notes (author_id);

create trigger set_updated_at
  before update on public.editorial_notes
  for each row execute function public.set_updated_at();

alter table public.editorial_notes enable row level security;
alter table public.editorial_notes force row level security;
revoke all on table public.editorial_notes from anon, authenticated;
grant select, insert, update on table public.editorial_notes to authenticated;

create policy "editors read notes"
  on public.editorial_notes for select to authenticated
  using ((select public.current_app_role()) in ('editor', 'admin'));

create policy "editors write notes"
  on public.editorial_notes for insert to authenticated
  with check ((select public.current_app_role()) in ('editor', 'admin') and author_id = (select auth.uid()));

create policy "editors update notes"
  on public.editorial_notes for update to authenticated
  using ((select public.current_app_role()) in ('editor', 'admin'))
  with check ((select public.current_app_role()) in ('editor', 'admin'));

create policy "authors read notes on their articles"
  on public.editorial_notes for select to authenticated
  using ((select public.current_app_role()) = 'contributor' and public.is_article_author(article_id));

-- ---------------------------------------------------------------------------
-- article_bylines: names + disclosures for a live article. Never email.
-- ---------------------------------------------------------------------------

create function public.article_bylines(article uuid)
returns table (display_name text, disclosure text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.display_name, d.text
    from public.articles a
    join public.article_authors aa on aa.article_id = a.id
    join public.profiles p on p.id = aa.profile_id
    left join public.disclosures d on d.profile_id = aa.profile_id
   where a.id = article_bylines.article
     and (
       (a.status = 'published' and a.published_at is not null and a.published_at <= pg_catalog.now())
       or (a.status = 'scheduled' and a.scheduled_for is not null and a.scheduled_for <= pg_catalog.now())
     )
   order by aa.sort, p.display_name;
$$;

revoke all on function public.article_bylines(uuid) from public;
grant execute on function public.article_bylines(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- editor_emails: who to notify when a story is submitted.
-- ---------------------------------------------------------------------------

create function public.editor_emails()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select p.email
    from public.profiles p
   where p.role in ('editor', 'admin')
     and p.email is not null
     and public.current_app_role() in ('contributor', 'editor', 'admin');
$$;

revoke all on function public.editor_emails() from public;
grant execute on function public.editor_emails() to authenticated;

-- ---------------------------------------------------------------------------
-- profile_id_for_email: editors resolve an existing account on approval.
-- ---------------------------------------------------------------------------

create function public.profile_id_for_email(lookup text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  found uuid;
begin
  if public.current_app_role() is null or public.current_app_role() not in ('editor', 'admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select p.id into found
    from public.profiles p
   where lower(p.email) = lower(pg_catalog.btrim(lookup))
   limit 1;
  return found;
end;
$$;

revoke all on function public.profile_id_for_email(text) from public;
grant execute on function public.profile_id_for_email(text) to authenticated;

-- ---------------------------------------------------------------------------
-- grant_contributor: editors promote readers to contributors. Runs as the
-- table owner, so profiles_lock_role allows the change.
-- ---------------------------------------------------------------------------

create function public.grant_contributor(target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  old_role public.app_role;
  target_site uuid;
begin
  -- 1. A real signed-in user.
  if caller is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- 2. Caller is an editor or admin.
  if public.current_app_role() is null or public.current_app_role() not in ('editor', 'admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  -- 3. Target exists.
  if target is null then
    raise exception 'invalid arguments' using errcode = '22004';
  end if;
  select p.role, p.site_id into old_role, target_site
    from public.profiles p
   where p.id = target
     for update;
  if not found then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;

  -- 4. Only readers become contributors; contributors are a no-op.
  if old_role = 'contributor' then
    return;
  end if;
  if old_role <> 'reader' then
    raise exception 'role not grantable' using errcode = 'P0001';
  end if;

  -- 5. Promote.
  update public.profiles set role = 'contributor' where id = target;

  -- 6. Audit.
  insert into public.audit_log (site_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    target_site,
    caller,
    'role.contributor',
    'profile',
    target,
    pg_catalog.jsonb_build_object('old_role', old_role, 'new_role', 'contributor')
  );
end;
$$;

revoke all on function public.grant_contributor(uuid) from public, anon, authenticated;
grant execute on function public.grant_contributor(uuid) to authenticated;
