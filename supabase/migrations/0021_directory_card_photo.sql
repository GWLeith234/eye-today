-- 0021_directory_card_photo.sql — directory cards lead with a facility photo.
--
-- The list card showed a 64px logo and a wall of text. The model (Village Media's directory) leads each
-- card with a cover photo and keeps the logo small. The card type gains the listing's first photo; the
-- two functions that return cards are recreated with the same bodies plus those two columns.

alter type public.directory_card add attribute photo_storage_path text;
alter type public.directory_card add attribute photo_alt text;

-- The first photo in the listing's own order, if any.
create function public._listing_first_photo(l public.directory_listings)
returns table (storage_path text, alt text)
language sql
stable
set search_path = ''
as $$
  select photo.storage_path, coalesce(photo.alt, '')
    from pg_catalog.unnest(l.photo_media_ids) with ordinality as ids(media_id, ord)
    join public.media photo on photo.id = ids.media_id
   order by ids.ord
   limit 1;
$$;
revoke all on function public._listing_first_photo(public.directory_listings) from public, anon, authenticated;

create or replace function public.directory_search(
  q text,
  country_code text,
  category_slug text,
  service text,
  verification text,
  page integer
) returns setof public.directory_card
language sql
stable
security definer
set search_path = ''
as $$
  with m as (
    select l.id, l.name as lname, match.rank,
           exists (
             select 1 from public.listing_features f
              where f.listing_id = l.id
                and f.site_id = l.site_id
                and f.status = 'active'
                and f.current_period_end > pg_catalog.now()
           ) as is_featured
      from public._directory_match(
             directory_search.q,
             directory_search.country_code,
             directory_search.category_slug,
             directory_search.service,
             directory_search.verification
           ) match
      join public.directory_listings l on l.id = match.id
  ), f as (
    select m.*,
           case when m.is_featured
                then pg_catalog.row_number() over (partition by m.is_featured order by m.rank desc, m.lname, m.id)
           end as frn
      from m
  ), o as (
    select f.*, (f.frn is not null and f.frn <= 3) as pinned from f
  )
  select l.name, l.slug, c.slug, c.name, l.country_code, l.region, l.city, l.services,
         l.verification_level::text, l.description, md.storage_path, md.alt,
         exists (
           select 1 from public.country_legal_status s
            where s.site_id = l.site_id and s.country_code = l.country_code and s.status = 'published'
         ),
         l.lat, l.lng, l.relationship_disclosure, o.pinned,
         p.storage_path, p.alt
    from o
    join public.directory_listings l on l.id = o.id
    join public.directory_categories c on c.id = l.category_id
    left join public.media md on md.id = l.logo_media_id
    left join lateral public._listing_first_photo(l) p on true
   order by o.pinned desc, o.rank desc, l.name asc, l.id
   limit 24
   offset (greatest(1, least(coalesce(directory_search.page, 1), 100)) - 1) * 24;
$$;

create or replace function public.article_directory_cards(p_article uuid)
returns setof public.directory_card
language sql
stable
security definer
set search_path = ''
as $$
  select l.name, l.slug, c.slug, c.name, l.country_code, l.region, l.city, l.services,
         l.verification_level::text, l.description, md.storage_path, md.alt,
         exists (
           select 1 from public.country_legal_status s
            where s.site_id = l.site_id and s.country_code = l.country_code and s.status = 'published'
         ),
         l.lat, l.lng, l.relationship_disclosure, false,
         p.storage_path, p.alt
    from public.article_listings al
    join public._live_articles() a on a.id = al.article_id
    join public.directory_listings l on l.id = al.listing_id and l.status = 'published'
    join public.directory_categories c on c.id = l.category_id and c.hidden = false
    left join public.media md on md.id = l.logo_media_id
    left join lateral public._listing_first_photo(l) p on true
   where al.article_id = p_article
   order by l.name, l.id
   limit 6;
$$;
