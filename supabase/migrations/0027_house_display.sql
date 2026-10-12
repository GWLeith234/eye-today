-- 0027_house_display.sql — house ads become display creatives.
--
-- The units now render artwork only (the serve route drops text-only HTML), so every house creative points at
-- the rendered image for its unit under /house-ads/ (scripts/house-ads/render.mjs). The image is an absolute
-- https URL on the site itself, so it is allowed by the ad sanitizer wherever the site is served from.

update public.ad_creatives c
   set html = '<a href="' || c.click_url || '"><img src="https://theeye.today/house-ads/' || s.key || '-' || s.width || 'x' || s.height || '.png" alt="' || replace(coalesce(c.alt, 'Eye Today'), '"', '') || '"></a>'
  from public.ad_slots s, public.ad_campaigns g
 where s.id = c.slot_id and g.id = c.campaign_id and g.is_house and c.media_id is null;
