-- 0020_edition_items_replace.sql — swap an edition's story list in one transaction.
--
-- The builder saves the whole ordered list. Doing that as a delete followed by inserts from the app
-- left a window where a failed insert, or two overlapping saves, could leave a published issue with no
-- stories. This function does both steps inside one statement, locks the edition row so saves
-- serialise, and runs as the caller (security invoker), so RLS still limits it to editors.

create function public.replace_edition_items(p_edition uuid, p_article_ids uuid[])
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_site uuid;
  v_ids uuid[] := coalesce(p_article_ids, '{}');
  v_count integer;
begin
  if cardinality(v_ids) > 100 then
    raise exception 'an edition holds at most 100 stories' using errcode = 'check_violation';
  end if;
  -- Visible only to editors under RLS; locks the row so concurrent saves queue rather than interleave.
  select e.site_id into v_site from public.editions e where e.id = p_edition for update;
  if v_site is null then
    raise exception 'edition not found' using errcode = 'no_data_found';
  end if;
  delete from public.edition_items i where i.edition_id = p_edition;
  insert into public.edition_items (site_id, edition_id, article_id, sort)
  select v_site, p_edition, t.article_id, (t.ord - 1)::integer
    from unnest(v_ids) with ordinality as t(article_id, ord);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.replace_edition_items(uuid, uuid[]) from public, anon;
grant execute on function public.replace_edition_items(uuid, uuid[]) to authenticated;
