-- 0029_takeover_units.sql — Sprint 24: the desktop takeover (the Village Media / SooToday model).
--
-- Two units join the slot table. The billboard (970×250, IAB) replaces the leaderboard at the top of every
-- desktop page, on its own band under the navigation. The skin (1920×1400) is the wallpaper behind the page:
-- the content column sits on it and the two gutters beside the column click through to the advertiser.
-- Together they are sold as the takeover; neither is part of the self-serve run-of-site buy, so no self-serve
-- creative can land in them (the app's upload form does not offer them). The leaderboard stays as the band
-- between sections.
--
-- A house billboard fills the top band when nothing is sold. There is no house skin: with nothing sold the
-- page sits on the plain stage colour.

insert into public.ad_slots (site_id, key, name, width, height)
select s.id, v.key, v.name, v.width, v.height
  from public.sites s
  cross join (values ('billboard', 'Billboard', 970, 250), ('skin', 'Skin (page takeover)', 1920, 1400)) as v(key, name, width, height)
on conflict (site_id, key) do nothing;

-- House billboard, for sites that have a house campaign. supabase/seed.sql repeats it for a fresh reset. The
-- artwork is rendered by scripts/house-ads/render.mjs, like the other house creatives (0027).
insert into public.ad_creatives (site_id, campaign_id, slot_id, click_url, alt, html, status, weight)
select g.site_id, g.id, s.id, 'https://theeye.today/editions', 'Read the monthly edition',
       '<a href="https://theeye.today/editions"><img src="https://theeye.today/house-ads/billboard-970x250.png" alt="Read the monthly edition"></a>',
       'approved', 1
  from public.ad_campaigns g
  join public.ad_slots s on s.site_id = g.site_id and s.key = 'billboard'
 where g.is_house and g.name = 'House ads'
   and not exists (select 1 from public.ad_creatives c where c.campaign_id = g.id and c.slot_id = s.id);
