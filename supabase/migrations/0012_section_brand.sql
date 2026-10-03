-- Section colour and icon, plus the author photo on public bylines.
-- 0001–0011 are applied in production and are not edited.
-- Stories gold is #976912: the proposed #9A6B12 is 4.41:1 on paper.

alter table public.sections
  add column color text,
  add column icon text;

alter table public.sections
  add constraint sections_color_hex check (color is null or color ~ '^#[0-9A-Fa-f]{6}$'),
  add constraint sections_icon_name check (icon is null or icon ~ '^[a-z0-9-]{1,32}$');

update public.sections as s
   set color = v.color,
       icon = v.icon
  from (values
    ('news', '#1E5B4A', 'news'),
    ('research-science', '#2F6FA3', 'research'),
    ('policy-law', '#6B4C9A', 'policy'),
    ('treatment-clinics', '#A9472F', 'treatment'),
    ('stories', '#976912', 'stories'),
    ('opinion', '#3F3F46', 'opinion')
  ) as v(slug, color, icon)
 where s.slug = v.slug;

-- Return type gains avatar_url, so the function is replaced rather than altered.
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

revoke all on function public.article_public_bylines(uuid) from public, anon, authenticated;
grant execute on function public.article_public_bylines(uuid) to anon, authenticated;

-- One row per live story: the first author's name and avatar. Used by the opinion rail.
create function public.section_author_faces(section_slug text, lim integer)
returns table (article_slug text, display_name text, avatar_url text)
language sql
stable
security definer
set search_path = ''
as $$
  select l.article_slug, face.display_name, face.avatar_url
    from public._live_articles() l
    join public.sections s on s.slug = l.section_slug
    join public.articles a on a.slug = l.article_slug and a.section_id = s.id
    left join lateral (
      select p.display_name, p.avatar_url
        from public.article_authors aa
        join public.profiles p on p.id = aa.profile_id
       where aa.article_id = a.id
       order by aa.sort, aa.created_at
       limit 1
    ) face on true
   where l.section_slug = section_author_faces.section_slug
   order by l.published_at desc, a.id
   limit least(greatest(coalesce(section_author_faces.lim, 0), 0), 8);
$$;

revoke all on function public.section_author_faces(text, integer) from public, anon, authenticated;
grant execute on function public.section_author_faces(text, integer) to anon, authenticated;
