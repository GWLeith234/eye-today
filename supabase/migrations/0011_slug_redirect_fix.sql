-- 0011_slug_redirect_fix.sql — a section move must redirect the old /section/slug.
--
-- articles.slug is unique per site (0001), so moving an article to another section keeps
-- its slug. The 0006 trigger already writes the old section and slug into slug_history.
-- article_slug_redirect used to return null whenever any article still had that slug,
-- which is always true after a section-only move, so the old URL 404'd instead of
-- redirecting. Null now means an article is filed at this exact section and slug.

create or replace function public.article_slug_redirect(section text, slug text)
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
  if exists (
    select 1
      from public.articles a
      join public.sections s on s.id = a.section_id
     where s.slug = article_slug_redirect.section
       and a.slug = article_slug_redirect.slug
  ) then
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

revoke all on function public.article_slug_redirect(text, text) from public, anon, authenticated;
grant execute on function public.article_slug_redirect(text, text) to anon, authenticated;
