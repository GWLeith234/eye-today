-- 0024_creative_unit_lock.sql — serialise the one-creative-per-unit check for self-serve campaigns.
--
-- 0023's _creative_media_fits() refused a second creative for the same campaign and unit with an
-- existence check, which two concurrent uploads could both pass. A transaction-scoped advisory lock
-- on (campaign, slot) makes the check serial; the lock is released at commit or rollback.

create or replace function public._creative_media_fits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slot public.ad_slots;
  v_media public.media;
begin
  if new.media_id is null then return new; end if;
  select * into v_slot from public.ad_slots s where s.id = new.slot_id;
  select * into v_media from public.media m where m.id = new.media_id;
  if v_media.id is null then raise exception 'invalid creative' using errcode = '23514'; end if;
  if (select public.current_app_role()) not in ('editor', 'admin') and v_media.owner_id is distinct from (select auth.uid()) then
    raise exception 'use your own upload' using errcode = '23514';
  end if;
  if v_slot.width > 0 and (v_media.width <> v_slot.width or v_media.height <> v_slot.height) then
    raise exception 'creative size must be % x %', v_slot.width, v_slot.height using errcode = '23514';
  end if;
  -- Equal rotation: a self-serve campaign holds one creative per unit. The advisory lock serialises
  -- concurrent uploads for the same campaign and unit so both cannot pass the check.
  if (select public.current_app_role()) not in ('editor', 'admin') then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(new.campaign_id::text || ':' || new.slot_id::text));
    if exists (select 1 from public.ad_creatives c where c.campaign_id = new.campaign_id and c.slot_id = new.slot_id and c.id <> new.id) then
      raise exception 'one creative per unit' using errcode = '23505';
    end if;
  end if;
  return new;
end;
$$;
