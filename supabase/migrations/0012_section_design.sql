-- 0012_section_design.sql — section colour and icon, and author photos on public reads.
--
-- sections.color / sections.icon: nullable, so a section with neither falls back to the brand
-- colour and no icon. Editors and admins already update sections (0003); the new columns fall
-- under the same table grants and policies, and anon already reads the table.
--
-- article_public_bylines and author_public gain avatar_url. profiles.avatar_url is writable by its
-- owner and constrained to http(s) in 0002, so it is only ever shown in an <img>. card_authors gives the
-- Opinion rail every card's first author and photo in one call instead of one per card.

alter table public.sections
  add column color text,
  add column icon text;

alter table public.sections
  add constraint sections_color_hex check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  add constraint sections_icon_slug check (icon is null or icon ~ '^[a-z][a-z0-9-]{0,31}$');

update public.sections set color = '#1E5B4A' where slug = 'news' and color is null;
update public.sections set color = '#2F6FA3' where slug = 'research-science' and color is null;
update public.sections set color = '#6B4C9A' where slug = 'policy-law' and color is null;
update public.sections set color = '#A9472F' where slug = 'treatment-clinics' and color is null;
update public.sections set color = '#966810' where slug = 'stories' and color is null;
update public.sections set color = '#3F3F46' where slug = 'opinion' and color is null;

update public.sections set icon = 'newspaper' where slug = 'news' and icon is null;
update public.sections set icon = 'flask' where slug = 'research-science' and icon is null;
update public.sections set icon = 'scale' where slug = 'policy-law' and icon is null;
update public.sections set icon = 'cross' where slug = 'treatment-clinics' and icon is null;
update public.sections set icon = 'book' where slug = 'stories' and icon is null;
update public.sections set icon = 'quote' where slug = 'opinion' and icon is null;

-- ---------------------------------------------------------------------------
-- Author photos on public reads. Return types change, so drop and recreate, then regrant.
-- ---------------------------------------------------------------------------

drop function public.article_public_bylines(uuid);
create function public.article_public_bylines(article uuid)
returns table (display_name text, disclosure text, author_slug text, avatar_url text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.display_name, d.text, p.slug, p.avatar_url
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

drop function public.author_public(text);
create function public.author_public(author_slug text)
returns table (display_name text, bio text, disclosure text, slug text, avatar_url text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.display_name, p.bio, d.text, p.slug, p.avatar_url
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

-- First author and photo for up to 24 live stories, keyed by article slug and section slug.
create function public.card_authors(section_slug text, article_slugs text[])
returns table (article_slug text, author_slug text, display_name text, avatar_url text)
language sql
stable
security definer
set search_path = ''
as $$
  select l.article_slug, p.slug, p.display_name, p.avatar_url
    from public._live_articles() l
    join lateral (
      select aa.profile_id
        from public.article_authors aa
       where aa.article_id = l.id
       order by aa.sort, aa.created_at
       limit 1
    ) first_author on true
    join public.profiles p on p.id = first_author.profile_id
   where l.section_slug = card_authors.section_slug
     and l.article_slug = any ((card_authors.article_slugs)[1:24]);
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.article_public_bylines(uuid)',
    'public.author_public(text)',
    'public.card_authors(text, text[])'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to anon, authenticated', fn);
  end loop;
end;
$$;
